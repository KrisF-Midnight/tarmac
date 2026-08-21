import type { Event } from "./types";

/**
 * Argument and environment parsing, separated out so the "what am I being asked
 * to do" decision is testable without running anything.
 *
 * The event is the interesting part. CI knows what triggered it and the laptop
 * does not, so the default is derived from the GitHub environment and falls
 * back to `local`. An unrecognised GitHub event resolves to `local` too:
 * running the safe subset is a better failure mode than either crashing or
 * quietly assuming a merge.
 */

export type Options = {
  appDir: string;
  event: Event;
  /** Restrict the run to these gate ids. Empty means all of them. */
  only: string[];
  /** Where to write the Markdown run summary, if anywhere. */
  markdownPath?: string;
  /** Where to write the collected facts as JSON, if anywhere. */
  factsPath?: string;
  colour: boolean;
  /** Print the usage text and run nothing. */
  help?: boolean;
};

export class UsageError extends Error {}

export const USAGE = `usage: gates [options]

  --app-dir <path>   repository to gate (default: current directory)
  --event <name>     local | pull_request | push (default: from GitHub env)
  --only <ids>       comma-separated gate ids to run
  --markdown <path>  write the Markdown run summary here; CI points this at
                     $GITHUB_STEP_SUMMARY
  --facts-out <path> write what the gates found, as JSON, here
  --no-colour        plain output
  --help, -h         print this and exit
`;

export function eventFrom(env: Record<string, string | undefined>): Event {
  const name = env.GITHUB_EVENT_NAME;
  return name === "pull_request" || name === "push" ? name : "local";
}

function valueAfter(argv: string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${flag} needs a value`);
  }
  return value;
}

export function parseArgs(argv: string[], env: Record<string, string | undefined>): Options {
  const options: Options = {
    appDir: ".",
    event: eventFrom(env),
    only: [],
    // Colour is noise in a CI log file, and GitHub sets CI on every runner.
    colour: !env.CI,
  };

  // Answered before anything else is read, so asking for help works on a
  // half-written command line rather than reporting the first thing wrong with
  // it. Nothing else in argv can matter once it is present: the run is not
  // going to happen.
  if (argv.includes("--help") || argv.includes("-h")) {
    return { ...options, help: true };
  }

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    switch (flag) {
      case "--app-dir":
        options.appDir = valueAfter(argv, i, flag);
        i++;
        break;
      case "--event": {
        const value = valueAfter(argv, i, flag);
        if (value !== "local" && value !== "pull_request" && value !== "push") {
          throw new UsageError(`unknown event: ${value}`);
        }
        options.event = value;
        i++;
        break;
      }
      case "--only":
        options.only = valueAfter(argv, i, flag)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
        break;
      case "--markdown":
        options.markdownPath = valueAfter(argv, i, flag);
        i++;
        break;
      case "--facts-out":
        options.factsPath = valueAfter(argv, i, flag);
        i++;
        break;
      case "--no-colour":
      case "--no-color":
        options.colour = false;
        break;
      default:
        throw new UsageError(`unknown option: ${flag}`);
    }
  }

  return options;
}
