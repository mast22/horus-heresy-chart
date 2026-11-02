const RELEASE = /^Book (\d+)$/;
const SIEGE = /^Terra Book (\d+)$/;
const COLLECTED = /^→ Book (\d+)$/;

/** Second line on a node. A release number stays off the face so it cannot be read as the path. */
export function nodePublication(publication: string): string | null {
  if (RELEASE.test(publication) || SIEGE.test(publication)) {
    return null;
  }
  const collected = COLLECTED.exec(publication);
  if (collected) {
    return `in Book ${collected[1]}`;
  }
  return publication;
}

/** The same fact in the detail panel, named so the number is a release, not a step. */
export function detailPublication(publication: string): string {
  const release = RELEASE.exec(publication);
  if (release) {
    return `Published as Book ${release[1]}`;
  }
  const siege = SIEGE.exec(publication);
  if (siege) {
    return `Published as Siege of Terra, Book ${siege[1]}`;
  }
  const collected = COLLECTED.exec(publication);
  if (collected) {
    return `Collected in Book ${collected[1]}`;
  }
  return publication;
}
