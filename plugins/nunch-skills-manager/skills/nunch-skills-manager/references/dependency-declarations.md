# Dependency declarations

Place `dependencies.json` at the plugin root. The manager reads it only for installed plugins.

```json
{
  "schemaVersion": 1,
  "executables": [
    {
      "name": "python3",
      "requirement": "Python 3.11+",
      "candidates": ["python3", "python"],
      "versionArgs": ["--version"],
      "versionPrefix": "Python ",
      "minimumVersion": "3.11"
    }
  ],
  "manual": [
    {
      "name": "Example MCP"
    }
  ]
}
```

## Fields

- `schemaVersion` must be `1`.
- `executables` declares commands the manager can probe directly without a shell.
- `name` is the stable dependency identity used for deduplication.
- `requirement` is the user-facing requirement.
- `candidates` lists executable names in fallback order. Paths are not accepted.
- `versionArgs` is passed as argv to each candidate.
- `versionPrefix` and `minimumVersion` are optional together when a minimum version matters.
- `manual` lists connections or setup steps that the manager must not install automatically.

Plugins sharing the same dependency `name` must use identical executable declarations. Bump the plugin version whenever its dependency declaration changes so the SessionStart signature detects it.
