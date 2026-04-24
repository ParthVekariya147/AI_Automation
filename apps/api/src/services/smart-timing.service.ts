import { AnalyticsLikeModel } from "../models/AnalyticsLike.js";

export async function suggestSmartTime(businessId: string) {
  const recent = await AnalyticsLikeModel.find({ businessId })
    .sort({ fetchedAt: -1 })
    .limit(25)
    .lean();

  const next = new Date();

  if (recent.length === 0) {
    next.setDate(next.getDate() + 1);
    next.setHours(11, 0, 0, 0);
    return {
      suggestedFor: next,
      reason: "No analytics history yet, so the platform suggested a safe default of tomorrow at 11:00."
    };
  }

  const averageLikes =
    recent.reduce((sum, item) => sum + item.likeCount, 0) / recent.length;

  next.setDate(next.getDate() + 1);
  next.setHours(averageLikes >= 50 ? 18 : 12, 30, 0, 0);

  return {
    suggestedFor: next,
    reason:
      averageLikes >= 50
        ? "Recent posts show stronger engagement, so the platform suggested an evening slot."
        : "Current likes trend is moderate, so the platform suggested a midday slot."
  };
}
