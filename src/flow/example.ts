export type ExampleNode = {
  id: string;
  data: {
    label: string;
  };
};

export type ExampleEdge = {
  id: string;
  source: string;
  target: string;
};

export const exampleNodes: readonly ExampleNode[] = [
  { id: "source", data: { label: "Source" } },
  { id: "intake", data: { label: "Intake" } },
  { id: "draft", data: { label: "Draft" } },
  { id: "review", data: { label: "Review" } },
  { id: "revise", data: { label: "Revise" } },
  { id: "publish", data: { label: "Publish" } },
  { id: "archive", data: { label: "Archive" } },
];

export const exampleEdges: readonly ExampleEdge[] = [
  { id: "source-draft", source: "source", target: "draft" },
  { id: "intake-draft", source: "intake", target: "draft" },
  { id: "draft-review", source: "draft", target: "review" },
  { id: "review-revise", source: "review", target: "revise" },
  { id: "revise-draft", source: "revise", target: "draft" },
  { id: "review-publish", source: "review", target: "publish" },
  { id: "publish-archive", source: "publish", target: "archive" },
];
