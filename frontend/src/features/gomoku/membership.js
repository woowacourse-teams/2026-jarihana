export async function syncGomokuMembership(queryClient, roomId) {
  await queryClient.cancelQueries({ queryKey: ["gomoku", "mine"] });
  queryClient.setQueryData(["gomoku", "mine"], { roomId });
  void queryClient.invalidateQueries({ queryKey: ["gomoku", "rooms"] });
}
