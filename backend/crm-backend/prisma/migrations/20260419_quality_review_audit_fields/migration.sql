-- Migration: add QualityReview audit fields for AI-review dispute resolution
-- and prompt-injection cross-check flagging.
--
-- * needsHumanReview  — set true when LLM score deviates >25 from heuristic
-- * rawPromptResponse — exact {systemPrompt,userPrompt,response,heuristicScore,deviation}
--                      pair used for the review (audit trail)

-- AlterTable: QualityReview add audit fields
ALTER TABLE "QualityReview"
    ADD COLUMN "needsHumanReview"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "rawPromptResponse" JSONB;

-- CreateIndex: allow fast lookup of reviews flagged for human review
CREATE INDEX "QualityReview_needsHumanReview_idx" ON "QualityReview"("needsHumanReview");
