import { z } from 'zod';

import marketplace from '../../.agents/plugins/marketplace.json' with { type: 'json' };

const catalogSchema = z.strictObject({
  name: z.literal('nunch-skills'),
  interface: z.object({ displayName: z.string() }),
  plugins: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string(),
      source: z.object({ path: z.string() }),
    }),
  ),
});

type CatalogPlugin = { name: string; category: string };

export function catalogPlugins(): CatalogPlugin[] {
  return catalogSchema
    .parse(marketplace)
    .plugins.map((plugin) => ({ name: plugin.name, category: plugin.category }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
