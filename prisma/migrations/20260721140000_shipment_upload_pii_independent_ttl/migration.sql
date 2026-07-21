-- ShipmentUploadRow.rawRowJson을 DB NULL 가능하도록 변경 (독립 14일 PII scrub)
-- createdAt 인덱스: 만료 조회용 (기존 열 활용, 스키마 추가형)

ALTER TABLE "ShipmentUploadRow" ALTER COLUMN "rawRowJson" DROP NOT NULL;

CREATE INDEX "ShipmentUploadRow_createdAt_idx" ON "ShipmentUploadRow"("createdAt");
CREATE INDEX "ShipmentMatch_createdAt_idx" ON "ShipmentMatch"("createdAt");
