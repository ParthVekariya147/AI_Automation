import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { AnalyticsLikeModel } from "../models/AnalyticsLike.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import type { AuthedRequest } from "../types.js";

const execAsync = promisify(exec);

async function git(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${cmd}`, {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
// from dist/controllers/ or src/controllers/ → 4 levels up = project root
const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const REPORTS_DIR  = path.join(PROJECT_ROOT, "reports");

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statBar(label: string, count: number, total: number, color: string) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
        <span style="font-weight:600;color:#334155;">${label}</span>
        <span style="color:#94a3b8;">${count} &nbsp;·&nbsp; ${pct}%</span>
      </div>
      <div style="height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;"></div>
      </div>
    </div>`;
}

function sectionHeading(text: string) {
  return `<h2 style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #f1f5f9;">${text}</h2>`;
}

function buildPostCard(post: any, highlight: boolean): string {
  const statusColor: Record<string, string> = {
    live:      "background:#d1fae5;color:#065f46",
    scheduled: "background:#dbeafe;color:#1e40af",
    new:       "background:#f1f5f9;color:#475569",
    posting:   "background:#fef3c7;color:#92400e",
    error:     "background:#fee2e2;color:#991b1b"
  };
  const badge  = statusColor[post.status as string] ?? statusColor.new;
  const border = highlight ? "#a7f3d0" : "#e2e8f0";
  const bg     = highlight ? "#f0fdf4" : "#fff";

  const account = post.instagramAccountId as any;
  const media   = (post.mediaAssetIds ?? []) as any[];

  const rows: string[] = [];
  rows.push(`<tr><td>Created</td><td>${esc(new Date(post.createdAt).toLocaleString())}</td></tr>`);
  if (post.scheduledFor) rows.push(`<tr><td>Scheduled For</td><td>${esc(new Date(post.scheduledFor).toLocaleString())}</td></tr>`);
  if (account?.name)    rows.push(`<tr><td>IG Account</td><td>${esc(account.name)} (@${esc(account.handle ?? "")})</td></tr>`);
  if (media.length)     rows.push(`<tr><td>Media (${media.length})</td><td>${media.map((m: any) => esc(m.originalName ?? "")).join(", ")}</td></tr>`);
  if (post.igMediaId)   rows.push(`<tr><td>IG Media ID</td><td style="font-family:monospace;">${esc(post.igMediaId)}</td></tr>`);
  if (post.permalink)   rows.push(`<tr><td>Instagram Link</td><td><a href="${esc(post.permalink)}" style="color:#059669;">${esc(post.permalink)}</a></td></tr>`);

  return `
<div style="border:1px solid ${border};border-radius:14px;padding:18px 22px;margin-bottom:14px;background:${bg};page-break-inside:avoid;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
    <div>
      <span style="font-size:15px;font-weight:700;color:#0f172a;">${esc(post.title)}</span>
      ${highlight ? `<span style="margin-left:8px;font-size:9px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:.08em;background:#d1fae5;padding:2px 7px;border-radius:99px;">Report Day</span>` : ""}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <span style="padding:3px 11px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;${badge}">${esc(post.status)}</span>
      <span style="padding:3px 11px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:#ede9fe;color:#5b21b6;">${esc(post.postType ?? "single")}</span>
    </div>
  </div>

  ${rows.length ? `
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
    <tbody style="color:#1e293b;">
      ${rows.map(r => r.replace(/<td>/g, '<td style="padding:4px 0;color:#64748b;width:150px;vertical-align:top;">').replace(/<\/td><td/, '</td><td style="padding:4px 0;vertical-align:top;"')).join("")}
    </tbody>
  </table>` : ""}

  ${post.caption ? `
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:5px;">Caption</div>
    <div style="font-size:13px;color:#1e293b;white-space:pre-wrap;line-height:1.6;">${esc(post.caption)}</div>
  </div>` : ""}

  ${post.hashtags?.length ? `
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px;">Hashtags (${post.hashtags.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;">
      ${post.hashtags.map((h: string) => `<span style="background:#dbeafe;color:#1e40af;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:500;">${esc(h)}</span>`).join("")}
    </div>
  </div>` : ""}

  ${post.collaborators?.length ? `
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:5px;">Collaborators</div>
    <div style="font-size:12px;color:#1e293b;">${post.collaborators.map((c: string) => "@" + esc(c)).join(", ")}</div>
  </div>` : ""}
</div>`;
}

function buildHtml(opts: {
  businessName: string;
  reportDate: string;
  posts: any[];
  likeSnapshots: any[];
}): string {
  const { businessName, reportDate, posts, likeSnapshots } = opts;

  const selectedDay = new Date(reportDate + "T00:00:00");
  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const dayPosts = posts.filter((p) => sameDay(new Date(p.createdAt), selectedDay));
  const dayLikes = likeSnapshots.filter((s) => sameDay(new Date(s.fetchedAt), selectedDay));

  const total      = posts.length;
  const live       = posts.filter((p) => p.status === "live").length;
  const scheduled  = posts.filter((p) => p.status === "scheduled").length;
  const draft      = posts.filter((p) => p.status === "new").length;
  const posting    = posts.filter((p) => p.status === "posting").length;
  const error      = posts.filter((p) => p.status === "error").length;

  const byType: Record<string, number> = {};
  for (const p of posts) {
    const t = (p.postType as string) ?? "single";
    byType[t] = (byType[t] ?? 0) + 1;
  }

  const formattedDate = selectedDay.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const dayPostsHtml = dayPosts.length
    ? dayPosts.map((p) => buildPostCard(p, true)).join("")
    : `<p style="color:#94a3b8;font-size:13px;padding:20px 0;">No posts were created on this date.</p>`;

  const allPostsHtml = posts.length
    ? posts.map((p) => buildPostCard(p, sameDay(new Date(p.createdAt), selectedDay))).join("")
    : `<p style="color:#94a3b8;font-size:13px;padding:20px 0;">No posts found.</p>`;

  const likesHtml = dayLikes.length
    ? `<div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;">
        ${dayLikes.map((s: any, i: number) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;${i < dayLikes.length - 1 ? "border-bottom:1px solid #f8fafc;" : ""}">
            <div>
              <span style="font-size:14px;font-weight:700;color:#0f172a;">${Number(s.likeCount).toLocaleString()} likes</span>
              <span style="margin-left:10px;font-size:10px;font-family:monospace;color:#94a3b8;">${esc(s.postDraftId ?? "")}</span>
            </div>
            <span style="font-size:11px;color:#64748b;">${new Date(s.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>`).join("")}
       </div>`
    : `<p style="color:#94a3b8;font-size:13px;padding:20px 0;">No like snapshots for this date.</p>`;

  const allLikesHtml = likeSnapshots.length
    ? `<div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;">
        ${likeSnapshots.map((s: any, i: number) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;${i < likeSnapshots.length - 1 ? "border-bottom:1px solid #f8fafc;" : ""}">
            <div>
              <span style="font-size:13px;font-weight:600;color:#0f172a;">${Number(s.likeCount).toLocaleString()} likes</span>
              <span style="margin-left:8px;font-size:10px;font-family:monospace;color:#94a3b8;">${esc(s.postDraftId ?? "")}</span>
            </div>
            <span style="font-size:11px;color:#64748b;">${new Date(s.fetchedAt).toLocaleString()}</span>
          </div>`).join("")}
       </div>`
    : `<p style="color:#94a3b8;font-size:13px;padding:20px 0;">No like snapshots recorded.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(businessName)} — Report — ${esc(reportDate)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:48px 24px;}
    .page{max-width:900px;margin:0 auto;}
    section{margin-bottom:44px;}
    @media print{
      body{background:#fff;padding:16px;}
      @page{margin:18mm;}
      section{page-break-inside:avoid;}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Cover ── -->
  <div style="background:linear-gradient(135deg,#10332b 0%,#1a5c4a 100%);color:#fff;border-radius:20px;padding:36px 40px;margin-bottom:44px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin-bottom:8px;">Instagram Content Report</div>
    <div style="font-size:30px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;">${esc(businessName)}</div>
    <div style="font-size:15px;opacity:.75;margin-bottom:2px;">${esc(formattedDate)}</div>
    <div style="font-size:11px;opacity:.4;margin-top:4px;">Generated ${new Date().toLocaleString()}</div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:28px;">
      ${[
        ["Posts This Day",    dayPosts.length,                                            "rgba(255,255,255,0.12)"],
        ["Published (Day)",  dayPosts.filter((p: any) => p.status === "live").length,      "rgba(52,211,153,0.22)"],
        ["Scheduled (Day)",  dayPosts.filter((p: any) => p.status === "scheduled").length, "rgba(96,165,250,0.22)"],
        ["Drafts (Day)",     dayPosts.filter((p: any) => p.status === "new").length,       "rgba(148,163,184,0.22)"]
      ].map(([l, v, bg]) => `
        <div style="background:${bg};border-radius:14px;padding:16px 18px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.65;margin-bottom:6px;">${l}</div>
          <div style="font-size:30px;font-weight:800;">${v}</div>
        </div>`).join("")}
    </div>
  </div>

  <!-- ── All-time summary ── -->
  <section>
    ${sectionHeading("All-time Summary")}
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;">
      ${[
        ["Total",     total,    "#f1f5f9", "#1e293b"],
        ["Live",      live,     "#d1fae5", "#065f46"],
        ["Scheduled", scheduled,"#dbeafe", "#1e40af"],
        ["Drafts",    draft,    "#f1f5f9", "#475569"],
        ["Posting",   posting,  "#fef3c7", "#92400e"],
        ["Error",     error,    "#fee2e2", "#991b1b"]
      ].map(([l, v, bg, col]) => `
        <div style="background:${bg};border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:10px;font-weight:600;color:${col};opacity:.8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">${l}</div>
          <div style="font-size:26px;font-weight:800;color:${col};">${v}</div>
        </div>`).join("")}
    </div>
  </section>

  <!-- ── Status breakdown ── -->
  <section>
    ${sectionHeading("Status Breakdown")}
    ${statBar("Live",      live,      total, "#10b981")}
    ${statBar("Scheduled", scheduled, total, "#60a5fa")}
    ${statBar("Draft",     draft,     total, "#94a3b8")}
    ${statBar("Posting",   posting,   total, "#f59e0b")}
    ${statBar("Error",     error,     total, "#f87171")}
  </section>

  <!-- ── Post type breakdown ── -->
  <section>
    ${sectionHeading("Post Type Breakdown")}
    ${Object.entries(byType).map(([t, c]) => statBar(
      t.charAt(0).toUpperCase() + t.slice(1), c, total,
      t === "single" ? "#8b5cf6" : t === "carousel" ? "#60a5fa" : t === "video" ? "#f97316" : "#ec4899"
    )).join("")}
  </section>

  <!-- ── Posts on report date ── -->
  <section>
    ${sectionHeading(`Posts Created on ${formattedDate} &nbsp;<span style="font-weight:400;color:#64748b;">(${dayPosts.length})</span>`)}
    ${dayPostsHtml}
  </section>

  <!-- ── Like snapshots for date ── -->
  <section>
    ${sectionHeading(`Like Snapshots — ${esc(selectedDay.toLocaleDateString("en-US", { month: "long", day: "numeric" }))} &nbsp;<span style="font-weight:400;color:#64748b;">(${dayLikes.length})</span>`)}
    ${likesHtml}
  </section>

  <!-- ── All posts full detail ── -->
  <section>
    ${sectionHeading(`All Posts — Full Detail &nbsp;<span style="font-weight:400;color:#64748b;">(${posts.length})</span>`)}
    ${allPostsHtml}
  </section>

  <!-- ── All like snapshots history ── -->
  <section>
    ${sectionHeading(`Like Snapshot History &nbsp;<span style="font-weight:400;color:#64748b;">(${likeSnapshots.length})</span>`)}
    ${allLikesHtml}
  </section>

  <!-- ── Footer ── -->
  <div style="text-align:center;padding:28px 0 8px;font-size:11px;color:#cbd5e1;border-top:1px solid #e2e8f0;">
    ${esc(businessName)} &nbsp;·&nbsp; Report for ${esc(formattedDate)} &nbsp;·&nbsp; Generated ${new Date().toLocaleString()}
  </div>

</div>
</body>
</html>`;
}

export const saveReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.body.businessId?.toString() || req.query.businessId?.toString();
  const reportDate = (req.body.reportDate?.toString() || req.query.reportDate?.toString() || new Date().toISOString().slice(0, 10));

  if (!businessId) throw new ApiError(400, "businessId is required");

  const [posts, likeSnapshots, businesses] = await Promise.all([
    PostDraftModel.find({ businessId })
      .populate("instagramAccountId", "name handle")
      .populate("mediaAssetIds", "originalName mediaType source")
      .sort({ createdAt: -1 })
      .lean(),
    AnalyticsLikeModel.find({ businessId }).sort({ fetchedAt: -1 }).lean(),
    import("../models/Business.js").then((m) =>
      m.BusinessModel.findById(businessId).lean()
    )
  ]);

  const businessName = (businesses as any)?.name ?? "Business";

  const html = buildHtml({ businessName, reportDate, posts, likeSnapshots });

  // Ensure reports directory exists
  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const fileName = `report-${slug}-${reportDate}.html`;
  const filePath = path.join(REPORTS_DIR, fileName);

  await writeFile(filePath, html, "utf-8");

  res.json({
    success: true,
    data: {
      fileName,
      filePath,
      savedTo: REPORTS_DIR,
      postsIncluded: posts.length,
      snapshotsIncluded: likeSnapshots.length
    }
  });
});

/* ─────────────────────────────────────────────────────────────
   Developer Daily Report
   ───────────────────────────────────────────────────────────── */

interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  email: string;
  date: string;
  filesChanged: Array<{ status: string; file: string }>;
  stat: string;
}

function buildDevReportHtml(opts: {
  reportDate: string;
  developerName: string;
  commits: CommitInfo[];
  wipFiles: Array<{ status: string; file: string }>;
  wipStat: string;
  newFiles: string[];
  projectRoot: string;
}): string {
  const { reportDate, developerName, commits, wipFiles, wipStat, newFiles, projectRoot } = opts;

  const dateObj = new Date(reportDate + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  // Parse diff stat totals
  function parseStat(stat: string) {
    const m = stat.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
    return {
      files:       parseInt(m?.[1] ?? "0") || 0,
      insertions:  parseInt(m?.[2] ?? "0") || 0,
      deletions:   parseInt(m?.[3] ?? "0") || 0
    };
  }

  const wipTotals   = parseStat(wipStat);
  const totalFiles  = new Set([
    ...commits.flatMap(c => c.filesChanged.map(f => f.file)),
    ...wipFiles.map(f => f.file)
  ]).size;

  // Categorise files by area
  function categorise(file: string): string {
    if (file.startsWith("apps/api/src/controllers")) return "API Controllers";
    if (file.startsWith("apps/api/src/services"))    return "API Services";
    if (file.startsWith("apps/api/src/models"))       return "Data Models";
    if (file.startsWith("apps/api/src/routes"))       return "API Routes";
    if (file.startsWith("apps/api"))                  return "Backend (Other)";
    if (file.startsWith("apps/web/src/pages"))        return "Frontend Pages";
    if (file.startsWith("apps/web/src/components"))   return "Frontend Components";
    if (file.startsWith("apps/web/src"))              return "Frontend (Other)";
    if (file.startsWith("docs"))                      return "Documentation";
    return "Config / Root";
  }

  const allModified = [
    ...commits.flatMap(c => c.filesChanged.map(f => f.file)),
    ...wipFiles.map(f => f.file)
  ];
  const byArea: Record<string, Set<string>> = {};
  for (const f of allModified) {
    const area = categorise(f);
    if (!byArea[area]) byArea[area] = new Set();
    byArea[area].add(f);
  }

  const statusIcon: Record<string, string> = {
    M: "✏️", A: "➕", D: "🗑", R: "🔄", "?": "🆕", " ": "·"
  };
  const statusLabel: Record<string, string> = {
    M: "Modified", A: "Added", D: "Deleted", R: "Renamed", "?": "New (untracked)"
  };

  function fileTag(file: string) {
    const parts = file.split("/");
    const name = parts.pop()!;
    const dir  = parts.join("/");
    return `<span style="color:#64748b;font-size:10px;">${esc(dir ? dir + "/" : "")}</span><span style="font-weight:600;">${esc(name)}</span>`;
  }

  function commitSection(c: CommitInfo) {
    return `
<div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px 22px;margin-bottom:14px;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
    <div>
      <span style="font-size:15px;font-weight:700;color:#0f172a;">${esc(c.subject)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <code style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:11px;color:#475569;">${esc(c.shortHash)}</code>
      <span style="font-size:11px;color:#94a3b8;">${new Date(c.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  </div>
  ${c.filesChanged.length ? `
  <div style="border-top:1px solid #f1f5f9;padding-top:12px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px;">Files Changed (${c.filesChanged.length})</div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${c.filesChanged.map(f => `
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-family:monospace;color:#334155;">
          <span title="${esc(statusLabel[f.status] ?? f.status)}" style="width:18px;">${statusIcon[f.status] ?? "·"}</span>
          ${fileTag(f.file)}
        </div>`).join("")}
    </div>
  </div>` : ""}
  ${c.stat ? `<div style="margin-top:10px;font-size:11px;color:#64748b;font-family:monospace;border-top:1px solid #f1f5f9;padding-top:8px;">${esc(c.stat.split("\n").pop() ?? "")}</div>` : ""}
</div>`;
  }

  function areaSection([area, files]: [string, Set<string>]) {
    const list = Array.from(files);
    return `
<div style="margin-bottom:10px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:6px;">${esc(area)} <span style="font-weight:400;color:#94a3b8;">(${list.length})</span></div>
  <div style="display:flex;flex-direction:column;gap:3px;padding-left:10px;border-left:3px solid #e2e8f0;">
    ${list.map(f => `<div style="font-size:12px;font-family:monospace;color:#334155;">${fileTag(f)}</div>`).join("")}
  </div>
</div>`;
  }

  const hasWip = wipFiles.length > 0 || newFiles.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Dev Report — ${esc(developerName)} — ${esc(reportDate)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:48px 24px;}
    .page{max-width:860px;margin:0 auto;}
    section{margin-bottom:40px;}
    h2{font-size:13px;font-weight:700;color:#0f172a;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #f1f5f9;}
    @media print{body{background:#fff;padding:16px;}@page{margin:18mm;}section{page-break-inside:avoid;}}
  </style>
</head>
<body>
<div class="page">

  <!-- ── Cover ── -->
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 60%,#4338ca 100%);color:#fff;border-radius:20px;padding:36px 40px;margin-bottom:40px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin-bottom:8px;">Daily Development Report</div>
    <div style="font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;">${esc(developerName)}</div>
    <div style="font-size:15px;opacity:.75;">${esc(formattedDate)}</div>
    <div style="font-size:11px;opacity:.4;margin-top:4px;">Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; ${esc(projectRoot)}</div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:28px;">
      ${[
        ["Commits Today",     commits.length,           "rgba(255,255,255,0.12)"],
        ["Files Touched",     totalFiles,                "rgba(99,102,241,0.3)"],
        ["Lines Added",       wipTotals.insertions + commits.reduce((s,c)=>s+parseStat(c.stat).insertions,0), "rgba(52,211,153,0.25)"],
        ["WIP Changes",       wipFiles.length + newFiles.length, "rgba(251,191,36,0.25)"]
      ].map(([l, v, bg]) => `
        <div style="background:${bg};border-radius:14px;padding:16px 18px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.65;margin-bottom:6px;">${l}</div>
          <div style="font-size:30px;font-weight:800;">${v}</div>
        </div>`).join("")}
    </div>
  </div>

  <!-- ── Commits ── -->
  <section>
    <h2>Commits Today (${commits.length})</h2>
    ${commits.length
      ? commits.map(commitSection).join("")
      : `<p style="color:#94a3b8;font-size:13px;padding:20px 0;">No commits on this date.</p>`}
  </section>

  <!-- ── Work in Progress ── -->
  ${hasWip ? `
  <section>
    <h2>Work in Progress — Uncommitted Changes</h2>

    ${wipFiles.length ? `
    <div style="border:1px solid #fef3c7;border-radius:14px;padding:18px 22px;background:#fffbeb;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#92400e;margin-bottom:10px;">Modified Files (${wipFiles.length})</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${wipFiles.map(f => `
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-family:monospace;color:#334155;">
            <span title="${esc(statusLabel[f.status] ?? f.status)}" style="width:18px;">${statusIcon[f.status] ?? "·"}</span>
            ${fileTag(f.file)}
          </div>`).join("")}
      </div>
      ${wipStat ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #fde68a;font-size:11px;color:#92400e;font-family:monospace;">${esc(wipStat.split("\n").pop() ?? "")}</div>` : ""}
    </div>` : ""}

    ${newFiles.length ? `
    <div style="border:1px solid #dbeafe;border-radius:14px;padding:18px 22px;background:#eff6ff;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#1e40af;margin-bottom:10px;">New Files — Not yet tracked (${newFiles.length})</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${newFiles.map(f => `
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-family:monospace;color:#334155;">
            <span style="width:18px;">🆕</span>
            ${fileTag(f)}
          </div>`).join("")}
      </div>
    </div>` : ""}
  </section>` : ""}

  <!-- ── Files by Area ── -->
  <section>
    <h2>All Files Touched — By Area</h2>
    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;background:#fff;">
      ${Object.entries(byArea).map(areaSection).join("")}
    </div>
  </section>

  <!-- ── Features & Work Summary ── -->
  <section>
    <h2>Work Summary</h2>
    <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>
          ${commits.map((c, i) => `
            <tr style="${i % 2 === 0 ? "background:#fafafa;" : ""}">
              <td style="padding:10px 16px;color:#94a3b8;font-family:monospace;font-size:11px;white-space:nowrap;width:70px;">${esc(c.shortHash)}</td>
              <td style="padding:10px 16px;color:#1e293b;font-weight:500;">${esc(c.subject)}</td>
              <td style="padding:10px 16px;color:#94a3b8;font-size:11px;white-space:nowrap;text-align:right;">${new Date(c.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
            </tr>`).join("")}
          ${hasWip ? `
            <tr style="border-top:2px solid #fef3c7;background:#fffbeb;">
              <td style="padding:10px 16px;color:#d97706;font-size:11px;font-weight:700;">WIP</td>
              <td style="padding:10px 16px;color:#92400e;font-weight:500;">Work in progress — ${wipFiles.length} modified, ${newFiles.length} new files</td>
              <td style="padding:10px 16px;color:#d97706;font-size:11px;text-align:right;">Uncommitted</td>
            </tr>` : ""}
        </tbody>
      </table>
    </div>
  </section>

  <!-- ── Next Steps (blank) ── -->
  <section>
    <h2>Plan for Tomorrow</h2>
    <div style="border:1px dashed #cbd5e1;border-radius:14px;padding:20px 24px;background:#f8fafc;color:#94a3b8;font-size:13px;min-height:80px;">
      <!-- Fill in manually after generating -->
    </div>
  </section>

  <!-- ── Footer ── -->
  <div style="text-align:center;padding:24px 0 8px;font-size:11px;color:#cbd5e1;border-top:1px solid #e2e8f0;">
    ${esc(developerName)} &nbsp;·&nbsp; ${esc(formattedDate)} &nbsp;·&nbsp; Generated ${new Date().toLocaleString()}
  </div>

</div>
</body>
</html>`;
}

export const saveDevReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");

  const reportDate = req.body.reportDate?.toString()
    ?? req.query.reportDate?.toString()
    ?? new Date().toISOString().slice(0, 10);

  const developerName: string = req.body.developerName?.toString()
    ?? req.user?.email?.split("@")[0]
    ?? "Developer";

  const since = `${reportDate} 00:00:00`;
  const until = `${reportDate} 23:59:59`;

  // 1. Commits on the report date with their file changes
  const logRaw = await git(
    `log --since="${since}" --until="${until}" --pretty=format:"COMMIT|%H|%h|%s|%an|%ae|%ai" --name-status`
  );

  const commits: CommitInfo[] = [];
  if (logRaw) {
    const blocks = logRaw.split(/(?=COMMIT\|)/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.trim().split("\n");
      const header = lines[0].replace(/^COMMIT\|/, "");
      const [hash, shortHash, subject, author, email, date] = header.split("|");

      const filesChanged: Array<{ status: string; file: string }> = [];
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const parts = line.split("\t");
        if (parts.length >= 2) {
          filesChanged.push({ status: parts[0].charAt(0), file: parts[parts.length - 1] });
        }
      }

      // Per-commit stat line
      const statRaw = await git(`show --stat --format="" ${hash}`);
      const statLine = statRaw.split("\n").filter(l => l.includes("changed")).join("").trim();

      commits.push({ hash, shortHash, subject, author, email, date, filesChanged, stat: statLine });
    }
  }

  // 2. Current uncommitted changes (WIP)
  const statusRaw  = await git("status --short");
  const wipFiles: Array<{ status: string; file: string }> = [];
  const newFiles:  string[] = [];

  for (const line of statusRaw.split("\n")) {
    if (!line.trim()) continue;
    const xy   = line.substring(0, 2);
    const file = line.substring(3).trim();
    if (xy.includes("?")) {
      newFiles.push(file);
    } else {
      const status = xy.trim().charAt(0) || "M";
      wipFiles.push({ status, file });
    }
  }

  const wipStat = await git("diff --stat HEAD");

  // Ensure reports dir exists
  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }

  const html     = buildDevReportHtml({ reportDate, developerName, commits, wipFiles, wipStat, newFiles, projectRoot: PROJECT_ROOT });
  const slug     = developerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const fileName = `dev-report-${slug}-${reportDate}.html`;
  const filePath = path.join(REPORTS_DIR, fileName);

  await writeFile(filePath, html, "utf-8");

  res.json({
    success: true,
    data: {
      fileName,
      filePath,
      savedTo:        REPORTS_DIR,
      commitsFound:   commits.length,
      wipFilesFound:  wipFiles.length,
      newFilesFound:  newFiles.length,
      developerName
    }
  });
});
