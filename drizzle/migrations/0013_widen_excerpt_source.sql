-- Excerpt writers now name themselves: Marginalia, the extension and
-- ThreadBrain via POST /api/excerpts' `client` field, the MCP as 'mcp'.
-- Existing rows keep their values; 'api' stays as the anonymous fallback.
ALTER TABLE "excerpts" DROP CONSTRAINT "excerpt_source_values";
ALTER TABLE "excerpts" ADD CONSTRAINT "excerpt_source_values" CHECK ("excerpts"."source" IN ('manual','extension','api','marginalia','mcp','threadbrain'));
