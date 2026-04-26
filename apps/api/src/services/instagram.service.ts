import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

export function ensureFacebookConfigured() {
  if (!env.facebookConfigured) {
    throw new ApiError(
      400,
      "Facebook OAuth is not configured yet. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in apps/api/.env."
    );
  }
}

export function signFacebookState(payload: { businessId: string; userId: string; frontendOrigin?: string }) {
  return jwt.sign({ ...payload, purpose: "facebook_oauth" }, env.JWT_SECRET, { expiresIn: "15m" });
}

export function verifyFacebookState(state: string) {
  const payload = jwt.verify(state, env.JWT_SECRET) as Record<string, unknown>;
  if ((payload as { purpose?: string }).purpose !== "facebook_oauth") {
    throw new ApiError(400, "Invalid Facebook OAuth state");
  }
  return payload as { businessId: string; userId: string; frontendOrigin?: string };
}

export function getFacebookOAuthUrl(state: string) {
  ensureFacebookConfigured();
  const redirectUri = encodeURIComponent(env.FACEBOOK_REDIRECT_URI);
  const clientId = env.FACEBOOK_APP_ID;
  const scopes = encodeURIComponent("instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement");
  return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}&response_type=code`;
}

export async function exchangeFacebookCode(code: string) {
  ensureFacebookConfigured();
  
  // 1. Get short-lived token
  const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(env.FACEBOOK_REDIRECT_URI)}&client_secret=${env.FACEBOOK_APP_SECRET}&code=${code}`;
  
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new ApiError(400, `Facebook OAuth failed: ${errorBody}`);
  }
  
  const tokenData = await tokenRes.json();
  const shortLivedToken = tokenData.access_token;

  // 2. Exchange for long-lived token
  const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.FACEBOOK_APP_ID}&client_secret=${env.FACEBOOK_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
  
  const longLivedRes = await fetch(longLivedUrl);
  if (!longLivedRes.ok) {
    const errorBody = await longLivedRes.text();
    throw new ApiError(400, `Failed to get long-lived token: ${errorBody}`);
  }
  
  const longLivedData = await longLivedRes.json();
  return longLivedData.access_token as string;
}

export async function fetchConnectedInstagramAccounts(accessToken: string) {
  // 1. Get User's Pages
  const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`;
  const pagesRes = await fetch(pagesUrl);
  const pagesData = await pagesRes.json();
  
  if (!pagesData.data) return [];

  const igAccounts: Array<{ name: string; handle: string; igUserId: string; pageId: string }> = [];

  // 2. For each Page, get linked Instagram account
  for (const page of pagesData.data) {
    const igUrl = `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`;
    const igRes = await fetch(igUrl);
    const igData = await igRes.json();

    if (igData.instagram_business_account) {
      const igUserId = igData.instagram_business_account.id;
      
      // 3. Get IG User Profile Info
      const profileUrl = `https://graph.facebook.com/v19.0/${igUserId}?fields=username,name&access_token=${accessToken}`;
      const profileRes = await fetch(profileUrl);
      const profileData = await profileRes.json();

      if (profileData.username) {
        igAccounts.push({
          name: profileData.name || profileData.username,
          handle: profileData.username,
          igUserId,
          pageId: page.id
        });
      }
    }
  }

  return igAccounts;
}

export async function postSingleMedia(igUserId: string, accessToken: string, imageUrl: string, caption: string) {
  const createUrl = `https://graph.facebook.com/v19.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`;
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create media container: ${await createRes.text()}`);
  const { id: containerId } = await createRes.json();

  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${accessToken}`;
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish media: ${await publishRes.text()}`);
  const { id: externalPostId } = await publishRes.json();

  const nodeUrl = `https://graph.facebook.com/v19.0/${externalPostId}?fields=permalink&access_token=${accessToken}`;
  const nodeRes = await fetch(nodeUrl);
  const { permalink } = await nodeRes.json();

  return { externalPostId, permalink };
}

export async function postVideoMedia(igUserId: string, accessToken: string, videoUrl: string, caption: string) {
  const createUrl = `https://graph.facebook.com/v19.0/${igUserId}/media?video_url=${encodeURIComponent(videoUrl)}&media_type=VIDEO&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`;
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create video container: ${await createRes.text()}`);
  const { id: containerId } = await createRes.json();

  let status = "IN_PROGRESS";
  while (status === "IN_PROGRESS" || status === "PUBLISHED" === false) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const statusUrl = `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();
    status = statusData.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR") throw new ApiError(400, "Video processing failed on Meta.");
  }

  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${accessToken}`;
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish video: ${await publishRes.text()}`);
  const { id: externalPostId } = await publishRes.json();

  const nodeUrl = `https://graph.facebook.com/v19.0/${externalPostId}?fields=permalink&access_token=${accessToken}`;
  const nodeRes = await fetch(nodeUrl);
  const { permalink } = await nodeRes.json();

  return { externalPostId, permalink };
}

export async function postCarouselMedia(igUserId: string, accessToken: string, imageUrls: string[], caption: string) {
  const childIds: string[] = [];
  
  for (const url of imageUrls) {
    const createChildUrl = `https://graph.facebook.com/v19.0/${igUserId}/media?image_url=${encodeURIComponent(url)}&is_carousel_item=true&access_token=${accessToken}`;
    const createChildRes = await fetch(createChildUrl, { method: "POST" });
    if (!createChildRes.ok) throw new ApiError(400, `Failed to create carousel child: ${await createChildRes.text()}`);
    const { id: childId } = await createChildRes.json();
    childIds.push(childId);
  }

  const createUrl = `https://graph.facebook.com/v19.0/${igUserId}/media?media_type=CAROUSEL&children=${childIds.join(",")}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`;
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create carousel container: ${await createRes.text()}`);
  const { id: containerId } = await createRes.json();

  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${accessToken}`;
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish carousel: ${await publishRes.text()}`);
  const { id: externalPostId } = await publishRes.json();

  const nodeUrl = `https://graph.facebook.com/v19.0/${externalPostId}?fields=permalink&access_token=${accessToken}`;
  const nodeRes = await fetch(nodeUrl);
  const { permalink } = await nodeRes.json();

  return { externalPostId, permalink };
}
