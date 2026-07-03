# Terraform-Lite

A declarative infrastructure provisioning engine demonstrating core Terraform concepts: config parsing, dependency graphs, state management, plan/diff, atomic apply, and multi-provider orchestration.

## Building

```bash
npm install
npm run build
```

## Usage

```bash
# Initialize state
node dist/cli/index.js init main.tf.json

# Preview changes
node dist/cli/index.js plan main.tf.json

# Apply configuration
node dist/cli/index.js apply main.tf.json

# Manage state
node dist/cli/index.js state list
node dist/cli/index.js state rm resource.name

# Visualize dependencies
node dist/cli/index.js graph main.tf.json

# Destroy all resources
node dist/cli/index.js destroy main.tf.json --force
```

Enable debug logging with `DEBUG=1`.

## Configuration

JSON-based resource declarations with variable interpolation:

```json
{
  "variable": {
    "app_name": { "default": "myapp" }
  },
  "resource": {
    "file": {
      "config": {
        "path": "./config.json",
        "content": "{\"app\": \"${var.app_name}\"}"
      }
    }
  }
}
```

## Providers

### Filesystem
- **file**: Create/update/delete files. Tracks content hash.
- **directory**: Create/update/delete directories.
- **template**: Render templates with variable substitution.

### Docker (simulated)
- **docker_network**: Create networks with subnet allocation.
- **docker_container**: Define containers with ports, env, memory.
- **docker_image**: Declare image dependencies.

### LocalDB (SQLite via sql.js)
- **sqlite_database**: Create databases (file or in-memory).
- **sqlite_table**: Define schema with columns and constraints.

## Architecture

**Config Parser** (`src/config/parser.ts`): Parse JSON, interpolate variables, extract resources.

**State Manager** (`src/state/manager.ts`): File-based state with versioning, locking, checkpoints for rollback.

**Dependency Graph** (`src/graph/builder.ts`): Build DAG from resources. Detect cycles. Topological sort for execution order.

**Plan Engine** (`src/engine/plan.ts`): Diff desired vs current state. Compute minimal change set (create/update/delete/no-op).

**Apply Engine** (`src/engine/apply.ts`): Execute resources in dependency order. Checkpoint before apply. Rollback on failure.

**Providers** (`src/providers/`): Abstract interface for resource CRUD. Each provider reconstructs resource state from ID + attributes (no in-process caching).

## State Management

State file (`terraform.tfstate`) contains:
- `version`: Schema version
- `serial`: Incremented on each apply (prevents stale state)
- `lineage`: Stable ID across state migrations
- `resources`: Current resource state
- `checkpoints`: Snapshots for rollback (max 10)

Locking via `terraform.tfstate.lock` prevents concurrent applies.

## Examples

### Filesystem
```bash
cd examples
node ../dist/cli/index.js apply filesystem.tf.json
# Creates ./data, ./config directories and files
```

### Docker
```bash
node ../dist/cli/index.js apply docker.tf.json
# Declares network, containers, images
```

### Database
```bash
node ../dist/cli/index.js apply localdb.tf.json
# Creates app.db with users and posts tables
```

## Design Notes

**Separate Processes**: Each CLI invocation is independent. No in-memory state persists between commands. State file is the source of truth.

**Dependency Ordering**: Topological sort of DAG ensures creates run before updates/deletes. Explicit `depends_on` and implicit references (attribute interpolation) create edges.

**Minimal Changes**: Plan engine only marks resources for update if attributes actually differ. Ignores provider metadata (timestamps, hashes) not in desired config.

**Atomic Apply**: Checkpoint created before any changes. On provider error, state reverts to checkpoint. Guarantees consistency.

**Idempotent Plan**: Re-running `plan` after successful `apply` reports 0 changes (not repeated diffs).

## Testing

```bash
# Compile
npm run build

# Example: apply and destroy
cd examples
node ../dist/cli/index.js init filesystem.tf.json
node ../dist/cli/index.js plan filesystem.tf.json
node ../dist/cli/index.js apply filesystem.tf.json
node ../dist/cli/index.js destroy filesystem.tf.json --force
```

## Files

```
src/cli/index.ts                # CLI commands
src/config/parser.ts            # Config parsing
src/engine/{plan,apply}.ts      # Core logic
src/graph/builder.ts            # Dependency DAG
src/providers/{base,*}.ts       # Provider implementations
src/state/manager.ts            # State management
src/utils/{logger,validation}.ts # Helpers
src/types.ts                    # TypeScript types

examples/                       # Sample configs
dist/                          # Compiled output
```

## Algorithms

**Cycle Detection**: 3-color DFS marks nodes white (unvisited), gray (visiting), black (done). Finding a gray node means cycle.

**Topological Sort**: Post-order DFS adds nodes after visiting dependencies. Result: dependencies before dependents.

**Minimal Changes**: Only compare desired attributes (in config) against state. Ignore metadata fields added by provider.

**Checkpoint Rollback**: Pre-apply snapshot enables instant recovery on error without distributed transactions.
