import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

type JsonMap = Record<string, unknown>;

interface InstagramAccountLookup {
  name: string;
  handle: string;
  igUserId: string;
  pageId: string;
}

function buildFallbackInstagramHandle(igUserId: string) {
  return `ig_${igUserId.slice(-10)}`;
}

function readInstagramNode(
  node: unknown,
  fallbackName: string
): { igUserId: string; handle?: string; name: string } | undefined {
  if (!node || typeof node !== "object") return undefined;

  const nodeMap = node as JsonMap;
  const igUserId = typeof nodeMap.id === "string" ? nodeMap.id : undefined;
  if (!igUserId) return undefined;

  const username = typeof nodeMap.username === "string" ? nodeMap.username : undefined;
  const name =
    typeof nodeMap.name === "string" && nodeMap.name.length > 0
      ? nodeMap.name
      : fallbackName;

  return {
    igUserId,
    handle: username,
    name
  };
}

async function readJsonMap(response: Response, context: string): Promise<JsonMap> {
  const body = await response.json();
  if (!body || typeof body !== "object") {
    throw new ApiError(400, `Invalid JSON response from ${context}`);
  }
  return body as JsonMap;
}

function readRequiredString(payload: JsonMap, key: string, context: string) {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `Missing ${key} in ${context} response`);
  }
  return value;
}

function buildFacebookGraphUrl(path: string, query: Record<string, string | undefined>) {
  const base = env.facebookGraphBaseUrl.endsWith("/")
    ? env.facebookGraphBaseUrl
    : `${env.facebookGraphBaseUrl}/`;
  const url = new URL(path.replace(/^\/+/, ""), base);

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export async function resolveCollaboratorIds(
  igUserId: string,
  accessToken: string,
  handles: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const handle of handles) {
    try {
      const url = buildFacebookGraphUrl(igUserId, {
        fields: "business_discovery.fields(id,username)",
        username: handle,
        access_token: accessToken
      });
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const discovery = data?.business_discovery as Record<string, unknown> | undefined;
      const id = typeof discovery?.id === "string" ? discovery.id : undefined;
      if (id) ids.push(id);
    } catch {
      // skip unresolvable handles
    }
  }
  return ids;
}

export function ensureFacebookConfigured() {
  const missingEnvKeys: string[] = [];
  if (!env.FACEBOOK_APP_ID.trim()) {
    missingEnvKeys.push("FACEBOOK_APP_ID");
  }
  if (!env.FACEBOOK_APP_SECRET.trim()) {
    missingEnvKeys.push("FACEBOOK_APP_SECRET");
  }
  if (!env.FACEBOOK_REDIRECT_URI.trim()) {
    missingEnvKeys.push("FACEBOOK_REDIRECT_URI");
  }

  if (missingEnvKeys.length > 0 || !env.facebookConfigured) {
    throw new ApiError(
      400,
      `Facebook OAuth is not configured yet. Missing: ${missingEnvKeys.join(", ") || "FACEBOOK_APP_ID or FACEBOOK_APP_SECRET"}. Add exact uppercase keys in apps/api/.env.`
    );
  }

  const maybeAccessTokenPrefixes = ["EAA", "GAA", "IGQV", "EAAG"];
  if (maybeAccessTokenPrefixes.some((prefix) => env.FACEBOOK_APP_SECRET.startsWith(prefix))) {
    throw new ApiError(
      400,
      "FACEBOOK_APP_SECRET looks like an access token, not an App Secret. Use Meta App Dashboard -> Settings -> Basic -> App Secret."
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

  const url = new URL(env.facebookDialogBaseUrl);
  url.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  url.searchParams.set("redirect_uri", env.FACEBOOK_REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", env.facebookScopes.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeFacebookCode(code: string) {
  ensureFacebookConfigured();

  // 1. Get short-lived token
  const tokenUrl = buildFacebookGraphUrl("oauth/access_token", {
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: env.FACEBOOK_REDIRECT_URI,
    client_secret: env.FACEBOOK_APP_SECRET,
    code
  });

  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new ApiError(400, `Facebook OAuth failed: ${errorBody}`);
  }

  const tokenData = await readJsonMap(tokenRes, "Facebook short-lived token exchange");
  const shortLivedToken = readRequiredString(
    tokenData,
    "access_token",
    "Facebook short-lived token exchange"
  );

  // 2. Exchange for long-lived token
  const longLivedUrl = buildFacebookGraphUrl("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken
  });

  const longLivedRes = await fetch(longLivedUrl);
  if (!longLivedRes.ok) {
    const errorBody = await longLivedRes.text();
    throw new ApiError(400, `Failed to get long-lived token: ${errorBody}`);
  }

  const longLivedData = await readJsonMap(longLivedRes, "Facebook long-lived token exchange");
  return readRequiredString(longLivedData, "access_token", "Facebook long-lived token exchange");
}

export async function fetchConnectedInstagramAccounts(accessToken: string) {
  // 1. Get User's Pages
  const pagesUrl = buildFacebookGraphUrl("me/accounts", {
    access_token: accessToken,
    fields:
      "id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}"
  });
  const pagesRes = await fetch(pagesUrl);
  if (!pagesRes.ok) {
    throw new ApiError(400, `Failed to load Facebook pages: ${await pagesRes.text()}`);
  }

  const pagesData = await readJsonMap(pagesRes, "Facebook pages list");
  const pages = pagesData.data;

  if (!Array.isArray(pages)) {
    throw new ApiError(400, "Invalid Pages response from Meta. Please try connecting again.");
  }

  if (pages.length === 0) {
    throw new ApiError(
      400,
      "No Facebook Pages were returned by Meta login. Reconnect, click Edit access, and select at least one Facebook Page."
    );
  }

  const igAccountsById = new Map<string, InstagramAccountLookup>();
  const profileLookupQueue = new Map<string, { pageId: string; lookupAccessToken: string; nameHint: string }>();
  const pageLookupErrors: string[] = [];

  // 2. For each Page, get linked Instagram account
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const pageMap = page as JsonMap;
    const pageId = pageMap.id;
    if (typeof pageId !== "string" || pageId.length === 0) continue;
    const pageName = typeof pageMap.name === "string" ? pageMap.name : "Instagram account";
    const pageAccessToken = typeof pageMap.access_token === "string" ? pageMap.access_token : undefined;
    const lookupAccessToken = pageAccessToken || accessToken;

    const embeddedNodes = [
      readInstagramNode(pageMap.instagram_business_account, pageName),
      readInstagramNode(pageMap.connected_instagram_account, pageName)
    ].filter((item): item is { igUserId: string; handle?: string; name: string } => Boolean(item));

    for (const node of embeddedNodes) {
      const existing = igAccountsById.get(node.igUserId);
      const fallbackHandle = buildFallbackInstagramHandle(node.igUserId);
      const resolvedHandle =
        typeof node.handle === "string" && node.handle.length > 0
          ? node.handle
          : existing?.handle || fallbackHandle;

      if (!existing || existing.handle.startsWith("ig_") || resolvedHandle === node.handle) {
        igAccountsById.set(node.igUserId, {
          name: node.name,
          handle: resolvedHandle,
          igUserId: node.igUserId,
          pageId
        });
      }

      if (!node.handle || node.handle.length === 0) {
        profileLookupQueue.set(node.igUserId, {
          pageId,
          lookupAccessToken,
          nameHint: node.name
        });
      }
    }

    const igUrl = buildFacebookGraphUrl(pageId, {
      fields: "instagram_business_account,connected_instagram_account",
      access_token: lookupAccessToken
    });
    const igRes = await fetch(igUrl);
    if (!igRes.ok) {
      const errorText = await igRes.text();
      pageLookupErrors.push(`Page ${pageId}: ${errorText}`);
      continue;
    }
    const igData = await readJsonMap(igRes, "Instagram business account lookup");

    const instagramBusinessAccount = igData.instagram_business_account;
    const connectedInstagramAccount = igData.connected_instagram_account;
    const igBusinessUserId =
      instagramBusinessAccount &&
        typeof instagramBusinessAccount === "object" &&
        typeof (instagramBusinessAccount as JsonMap).id === "string"
        ? ((instagramBusinessAccount as JsonMap).id as string)
        : undefined;
    const connectedUserId =
      connectedInstagramAccount &&
        typeof connectedInstagramAccount === "object" &&
        typeof (connectedInstagramAccount as JsonMap).id === "string"
        ? ((connectedInstagramAccount as JsonMap).id as string)
        : undefined;
    const igUserId = igBusinessUserId || connectedUserId;

    if (igUserId) {
      if (!igAccountsById.has(igUserId)) {
        igAccountsById.set(igUserId, {
          name: pageName,
          handle: buildFallbackInstagramHandle(igUserId),
          igUserId,
          pageId
        });
        profileLookupQueue.set(igUserId, {
          pageId,
          lookupAccessToken,
          nameHint: pageName
        });
      }
    }
  }

  // 3. Resolve any remaining IG ids that did not include username in embedded responses.
  for (const [igUserId, lookup] of profileLookupQueue.entries()) {
    const profileUrl = buildFacebookGraphUrl(igUserId, {
      fields: "username,name",
      access_token: lookup.lookupAccessToken
    });
    const profileRes = await fetch(profileUrl);
    if (!profileRes.ok) {
      const errorText = await profileRes.text();
      pageLookupErrors.push(`IG profile ${igUserId} on page ${lookup.pageId}: ${errorText}`);
      continue;
    }
    const profileData = await readJsonMap(profileRes, "Instagram profile lookup");
    const username = profileData.username;

    if (typeof username === "string" && username.length > 0) {
      const existing = igAccountsById.get(igUserId);
      const name =
        typeof profileData.name === "string" && profileData.name.length > 0
          ? profileData.name
          : existing?.name || lookup.nameHint;

      igAccountsById.set(igUserId, {
        name,
        handle: username,
        igUserId,
        pageId: lookup.pageId
      });
    }
  }

  if (igAccountsById.size === 0) {
    if (pageLookupErrors.length > 0) {
      throw new ApiError(
        400,
        `Could not read Instagram links from selected Pages. ${pageLookupErrors[0]}`
      );
    }

    throw new ApiError(
      400,
      "Facebook Pages were found, but none has a linked Instagram Professional account. Link the Instagram account to the Page, then reconnect."
    );
  }

  return Array.from(igAccountsById.values());
}

export async function postSingleMedia(igUserId: string, accessToken: string, imageUrl: string, caption: string, collaborators?: string[]) {
  const createUrl = buildFacebookGraphUrl(`${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
    ...(collaborators?.length ? { collaborator_tags: JSON.stringify(collaborators) } : {})
  });
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create media container: ${await createRes.text()}`);
  const createData = await readJsonMap(createRes, "Instagram media container creation");
  const containerId = readRequiredString(createData, "id", "Instagram media container creation");

  const publishUrl = buildFacebookGraphUrl(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish media: ${await publishRes.text()}`);
  const publishData = await readJsonMap(publishRes, "Instagram media publish");
  const externalPostId = readRequiredString(publishData, "id", "Instagram media publish");

  const nodeUrl = buildFacebookGraphUrl(externalPostId, {
    fields: "permalink",
    access_token: accessToken
  });
  const nodeRes = await fetch(nodeUrl);
  const nodeData = await readJsonMap(nodeRes, "Instagram media node lookup");
  const permalink = readRequiredString(nodeData, "permalink", "Instagram media node lookup");

  return { externalPostId, permalink };
}

export async function postVideoMedia(igUserId: string, accessToken: string, videoUrl: string, caption: string, collaborators?: string[]) {
  const createUrl = buildFacebookGraphUrl(`${igUserId}/media`, {
    video_url: videoUrl,
    media_type: "VIDEO",
    caption,
    access_token: accessToken,
    ...(collaborators?.length ? { collaborator_tags: JSON.stringify(collaborators) } : {})
  });
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create video container: ${await createRes.text()}`);
  const createData = await readJsonMap(createRes, "Instagram video container creation");
  const containerId = readRequiredString(createData, "id", "Instagram video container creation");

  let status = "IN_PROGRESS";
  let attempts = 0;
  while (status === "IN_PROGRESS" && attempts < 24) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    const statusUrl = buildFacebookGraphUrl(containerId, {
      fields: "status_code",
      access_token: accessToken
    });
    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      throw new ApiError(400, `Failed to check video status: ${await statusRes.text()}`);
    }
    const statusData = await readJsonMap(statusRes, "Instagram video status");
    status = readRequiredString(statusData, "status_code", "Instagram video status");
    if (status === "FINISHED") break;
    if (status === "ERROR") throw new ApiError(400, "Video processing failed on Meta.");
  }
  if (status !== "FINISHED") throw new ApiError(400, "Video processing timed out after 2 minutes.");

  const publishUrl = buildFacebookGraphUrl(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish video: ${await publishRes.text()}`);
  const publishData = await readJsonMap(publishRes, "Instagram video publish");
  const externalPostId = readRequiredString(publishData, "id", "Instagram video publish");

  const nodeUrl = buildFacebookGraphUrl(externalPostId, {
    fields: "permalink",
    access_token: accessToken
  });
  const nodeRes = await fetch(nodeUrl);
  const nodeData = await readJsonMap(nodeRes, "Instagram video node lookup");
  const permalink = readRequiredString(nodeData, "permalink", "Instagram video node lookup");

  return { externalPostId, permalink };
}

export async function postReelsMedia(igUserId: string, accessToken: string, videoUrl: string, caption: string, collaborators?: string[]) {
  const createUrl = buildFacebookGraphUrl(`${igUserId}/media`, {
    video_url: videoUrl,
    media_type: "REELS",
    caption,
    access_token: accessToken,
    ...(collaborators?.length ? { collaborator_tags: JSON.stringify(collaborators) } : {})
  });
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create Reels container: ${await createRes.text()}`);
  const createData = await readJsonMap(createRes, "Instagram Reels container creation");
  const containerId = readRequiredString(createData, "id", "Instagram Reels container creation");

  let status = "IN_PROGRESS";
  let attempts = 0;
  while (status === "IN_PROGRESS" && attempts < 24) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    const statusUrl = buildFacebookGraphUrl(containerId, {
      fields: "status_code",
      access_token: accessToken
    });
    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) throw new ApiError(400, `Failed to check Reels status: ${await statusRes.text()}`);
    const statusData = await readJsonMap(statusRes, "Instagram Reels status");
    status = readRequiredString(statusData, "status_code", "Instagram Reels status");
    if (status === "FINISHED") break;
    if (status === "ERROR") throw new ApiError(400, "Reels processing failed on Meta.");
  }
  if (status !== "FINISHED") throw new ApiError(400, "Reels processing timed out after 2 minutes.");

  const publishUrl = buildFacebookGraphUrl(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish Reels: ${await publishRes.text()}`);
  const publishData = await readJsonMap(publishRes, "Instagram Reels publish");
  const externalPostId = readRequiredString(publishData, "id", "Instagram Reels publish");

  const nodeUrl = buildFacebookGraphUrl(externalPostId, {
    fields: "permalink",
    access_token: accessToken
  });
  const nodeRes = await fetch(nodeUrl);
  const nodeData = await readJsonMap(nodeRes, "Instagram Reels node lookup");
  const permalink = readRequiredString(nodeData, "permalink", "Instagram Reels node lookup");

  return { externalPostId, permalink };
}

export async function postCarouselMedia(igUserId: string, accessToken: string, imageUrls: string[], caption: string) {
  const childIds: string[] = [];

  for (const url of imageUrls) {
    const createChildUrl = buildFacebookGraphUrl(`${igUserId}/media`, {
      image_url: url,
      is_carousel_item: "true",
      access_token: accessToken
    });
    const createChildRes = await fetch(createChildUrl, { method: "POST" });
    if (!createChildRes.ok) throw new ApiError(400, `Failed to create carousel child: ${await createChildRes.text()}`);
    const createChildData = await readJsonMap(createChildRes, "Instagram carousel child creation");
    const childId = readRequiredString(createChildData, "id", "Instagram carousel child creation");
    childIds.push(childId);
  }

  const createUrl = buildFacebookGraphUrl(`${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: accessToken
  });
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new ApiError(400, `Failed to create carousel container: ${await createRes.text()}`);
  const createData = await readJsonMap(createRes, "Instagram carousel container creation");
  const containerId = readRequiredString(createData, "id", "Instagram carousel container creation");

  const publishUrl = buildFacebookGraphUrl(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new ApiError(400, `Failed to publish carousel: ${await publishRes.text()}`);
  const publishData = await readJsonMap(publishRes, "Instagram carousel publish");
  const externalPostId = readRequiredString(publishData, "id", "Instagram carousel publish");

  const nodeUrl = buildFacebookGraphUrl(externalPostId, {
    fields: "permalink",
    access_token: accessToken
  });
  const nodeRes = await fetch(nodeUrl);
  const nodeData = await readJsonMap(nodeRes, "Instagram carousel node lookup");
  const permalink = readRequiredString(nodeData, "permalink", "Instagram carousel node lookup");

  return { externalPostId, permalink };
}
