export const SCHEMA_VERSION = 1;
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document))) STRICT;
CREATE TABLE IF NOT EXISTS story_runs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, story_id TEXT NOT NULL REFERENCES stories(id), document TEXT NOT NULL CHECK(json_valid(document))) STRICT;
CREATE TABLE IF NOT EXISTS story_nodes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES story_runs(id), step INTEGER NOT NULL CHECK(step BETWEEN 1 AND 2), operation_id TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), UNIQUE(run_id,step), UNIQUE(run_id,operation_id)) STRICT;
CREATE TABLE IF NOT EXISTS comic_panels (id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES story_nodes(id), sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 2), document TEXT NOT NULL CHECK(json_valid(document)), UNIQUE(node_id,sequence)) STRICT;
CREATE TABLE IF NOT EXISTS generation_events (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES story_runs(id), node_id TEXT NOT NULL REFERENCES story_nodes(id), panel_id TEXT REFERENCES comic_panels(id), stage TEXT NOT NULL CHECK(stage IN ('script','image')), sequence INTEGER NOT NULL, operation_id TEXT NOT NULL, status TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), UNIQUE(run_id,operation_id)) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS active_stage ON generation_events(node_id,stage,sequence) WHERE status IN ('planned','running');
CREATE INDEX IF NOT EXISTS event_runs ON generation_events(run_id);
CREATE TABLE IF NOT EXISTS replay_operations (run_id TEXT NOT NULL REFERENCES story_runs(id), operation_id TEXT NOT NULL, node_id TEXT NOT NULL REFERENCES story_nodes(id), approach TEXT NOT NULL, PRIMARY KEY(run_id,operation_id)) STRICT;
PRAGMA user_version = 1;
`;
