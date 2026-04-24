export async function publishToInstagram() {
  return {
    status: "live" as const,
    externalPostId: `mock_${Date.now()}`,
    message:
      "Instagram publishing is scaffolded. Replace this mock implementation with Graph API publishing once live credentials are configured."
  };
}
