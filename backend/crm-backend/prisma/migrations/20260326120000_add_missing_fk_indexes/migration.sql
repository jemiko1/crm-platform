-- CreateIndex
CREATE INDEX "ClientChatConversation_channelAccountId_idx" ON "ClientChatConversation"("channelAccountId");

-- CreateIndex
CREATE INDEX "ClientChatConversation_clientId_idx" ON "ClientChatConversation"("clientId");

-- CreateIndex
CREATE INDEX "ClientChatConversation_participantId_idx" ON "ClientChatConversation"("participantId");

-- CreateIndex
CREATE INDEX "ClientChatMessage_participantId_idx" ON "ClientChatMessage"("participantId");

-- CreateIndex
CREATE INDEX "ClientChatMessage_senderUserId_idx" ON "ClientChatMessage"("senderUserId");

-- CreateIndex
CREATE INDEX "ClientChatParticipant_channelAccountId_idx" ON "ClientChatParticipant"("channelAccountId");

-- CreateIndex
CREATE INDEX "SalesPlan_approvedById_idx" ON "SalesPlan"("approvedById");

-- CreateIndex
CREATE INDEX "StockTransaction_batchId_idx" ON "StockTransaction"("batchId");
