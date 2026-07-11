import { Server, Socket } from "socket.io";

export const registerToolkitHandlers = (io: Server, socket: Socket) => {
  socket.on("toolkit:join", (data: { groupId: string }) => {
    if (data?.groupId) {
      console.log(`📡 Socket ${socket.id} joined toolkit room: ${data.groupId}`);
      socket.join(data.groupId);
    }
  });

  socket.on("toolkit:leave", (data: { groupId: string }) => {
    if (data?.groupId) {
      socket.leave(data.groupId);
    }
  });
};
