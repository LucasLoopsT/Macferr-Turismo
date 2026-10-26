import type { Config } from '../config/env';
import { createFileStore, type DestinoStore } from './destinoStore';
import { createGitHubStore } from './githubStore';

/**
 * Escolhe onde os destinos ficam:
 *  - com GITHUB_TOKEN: no arquivo JSON do repositório (é o que o site público lê);
 *  - sem token (só desenvolvimento/testes): arquivo local em DATA_DIR, como antes.
 */
export function createDestinoStore(config: Config): DestinoStore {
  if (config.github) {
    const { token, owner, repo, branch, path } = config.github;
    return createGitHubStore({ token, owner, repo, branch, path });
  }
  return createFileStore({ dataDir: config.dataDir, seedFile: config.seedFile });
}
