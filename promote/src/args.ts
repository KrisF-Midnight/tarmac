import { UsageError } from "../../gates/src/args";

/**
 * What promotion needs to be told, and what it works out for itself.
 *
 * The important default is `dryRun`. This command edits a file and pushes a
 * commit, and it is in the same repository as `make ci`, which anyone may run
 * on a laptop at any time. So the safe mode is the default and the dangerous
 * one has to be arrived at deliberately: writing requires being inside GitHub
 * Actions, and `--dry-run` can still override that. There is no flag that turns
 * writing on from a laptop, which is the point — the separation between "verify"
 * and "mutate" is only real if it cannot be undone by a flag someone copies out
 * of a runbook.
 */

export type Options = {
  /** Path to the JSON written by the gate run's `--facts-out`. */
  factsPath: string;
  /** Application name. Selects the manifest and the container by convention. */
  app: string;
  /** The platform checkout holding `gitops/`. */
  repoDir: string;
  /** Overrides the conventional `gitops/<app>/deployment.yaml`. */
  manifestPath?: string;
  /** Overrides the container name, which defaults to the application name. */
  container?: string;
  branch: string;
  remote: string;
  dryRun: boolean;
};

export { UsageError };

export const USAGE = `usage: promote [options]

  --facts <path>      gate run facts, as written by 'gates --facts-out'
  --app <name>        application being promoted
  --repo <path>       platform checkout to edit (default: current directory)
  --manifest <path>   manifest to edit (default: gitops/<app>/deployment.yaml)
  --container <name>  container to update (default: the application name)
  --branch <name>     branch to push to (default: main)
  --remote <name>     remote to push to (default: origin)
  --dry-run           print the change and stop

Writes only inside GitHub Actions. Anywhere else it is a dry run whether or
not --dry-run was given.
`;

function valueAfter(argv: string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${flag} needs a value`);
  }
  return value;
}

export function parseArgs(argv: string[], env: Record<string, string | undefined>): Options {
  const options: Options = {
    factsPath: "",
    app: "",
    repoDir: ".",
    branch: "main",
    remote: "origin",
    dryRun: env.GITHUB_ACTIONS !== "true",
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    switch (flag) {
      case "--facts":
        options.factsPath = valueAfter(argv, i, flag);
        i++;
        break;
      case "--app":
        options.app = valueAfter(argv, i, flag);
        i++;
        break;
      case "--repo":
        options.repoDir = valueAfter(argv, i, flag);
        i++;
        break;
      case "--manifest":
        options.manifestPath = valueAfter(argv, i, flag);
        i++;
        break;
      case "--container":
        options.container = valueAfter(argv, i, flag);
        i++;
        break;
      case "--branch":
        options.branch = valueAfter(argv, i, flag);
        i++;
        break;
      case "--remote":
        options.remote = valueAfter(argv, i, flag);
        i++;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new UsageError(`unknown option: ${flag}`);
    }
  }

  if (!options.factsPath) throw new UsageError("--facts is required");
  if (!options.app) throw new UsageError("--app is required");

  return options;
}

/**
 * By convention, not by configuration. An application that rides the road gets
 * its manifest at a path the platform can derive from its name; a per-app
 * setting here would be the first line of the config file the whole design is
 * arranged to avoid.
 */
export function manifestPathFor(options: Options): string {
  return options.manifestPath ?? `gitops/${options.app}/deployment.yaml`;
}

export function containerFor(options: Options): string {
  return options.container ?? options.app;
}
