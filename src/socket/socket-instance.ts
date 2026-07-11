import { Server } from "socket.io";

let _io: Server | null = null;

/** Called once from index.ts after Socket.IO is initialised. */
export const setIo = (io: Server): void => {
  _io = io;
};

/** Returns the global Socket.IO server, or null before init. */
export const getIo = (): Server | null => _io;
