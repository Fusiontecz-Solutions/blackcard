import { axiosGet, axiosPost } from "@/redux/axios";
import { io, Socket } from "socket.io-client";

/* ================================
   API TYPES (BACKEND SHAPE)
================================ */

export interface ApiChannel {
    id: string;
    name: string;
    type: "channel" | "dm";
    isPrivate?: boolean;

    members?: {
        _id: string;
        firstName: string;
        lastName: string;
        role: string;
    }[];

    otherUser?: {
        _id: string;
        firstName: string;
        lastName: string;
        role: string;
    };

    lastMessage?: any;
    lastMessageAt?: string | null;
    createdAt?: string;
}

export interface ApiChatMessage {
    id: string;
    channelId?: string;
    senderId: string;
    receiverId?: string;
    senderName?: string;   // not always present (backend mapMessage omits it)
    senderRole?: string;   // not always present
    message: string;
    messageType: "channel" | "dm";
    type: "text" | "system" | "file";
    attachments?: {
        name: string;
        type: string;
        url: string;
    }[];
    replyTo?: string | null;
    createdAt: string;
}

export interface CreateChannelPayload {
    name: string;
    type?: "channel" | "dm";
    isPrivate?: boolean;
    members?: string[];
}

export interface User {
    _id: string;
    firstName: string;
    lastName: string;
    role: string;
    email?: string;
}

export interface SendMessageAck {
    success: boolean;
    channelId?: string;
    error?: string;
}

/* ================================
   SOCKET
================================ */

let socket: Socket | null = null;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || "/socket.io";

export const initChatSocket = (token: string) => {
    if (socket?.connected) return socket;            // already connected

    socket = io(SOCKET_URL!, {
        path: SOCKET_PATH,
        auth: { token },
        transports: ["polling", "websocket"],
        withCredentials: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 25000,
    });

    socket.on("connect", () => {
        console.log("✅ [teamChatService] socket connected:", socket?.id);
    });

    socket.on("connect_error", (err) => {
        console.error("❌ [teamChatService] socket connect_error:", err.message);
    });

    socket.on("disconnect", (reason) => {
        console.warn("⚠️ [teamChatService] socket disconnected:", reason);
    });

    return socket;
};

export const getChatSocket = (): Socket | null => socket;

export const disconnectChatSocket = () => {
    socket?.disconnect();
    socket = null;
};

/* ================================
   CHANNEL API CALLS
================================ */

export const createChannel = async (
    payload: CreateChannelPayload
): Promise<ApiChannel> => {
    const res = await axiosPost("/team-chat/channel", payload);
    return res.data.data;
};

export const getChannels = async (): Promise<ApiChannel[]> => {
    const res = await axiosGet("/team-chat/channels");
    return res.data.data;
};

export const getMessages = async (
    channelId: string
): Promise<ApiChatMessage[]> => {
    const res = await axiosGet(`/team-chat/messages/${channelId}`);
    return res.data.data;
};

export const getAllUsers = async (): Promise<User[]> => {
    const res = await axiosGet("/users/getuser");
    return res.data?.data || [];
};

export const getUsers = async (): Promise<User[]> => {
    const res = await axiosGet("/users/getallusers");
    return res.data?.data || [];
};

/* ================================
   SOCKET HELPERS
================================ */

export const joinChannel = (channelId: string) => {
    socket?.emit("join_channel", channelId);
};

export const leaveChannel = (channelId: string) => {
    socket?.emit("leave_channel", channelId);
};

export const sendMessage = (
    payload: {
        message: string;
        channelId?: string;
        receiverId?: string;
        type?: "text" | "file" | "system";
        messageType: "channel" | "dm";
        replyTo?: string | null;
        attachments?: { name: string; type: string; url: string }[];
    }
): Promise<SendMessageAck> => {
    return new Promise((resolve, reject) => {
        if (!socket) {
            reject(new Error("Socket not initialized"));
            return;
        }

        const ack = (res: SendMessageAck) => {
            if (!res.success) {
                reject(new Error(res.error || "Send failed"));
            } else {
                resolve(res);
            }
        };

        if (payload.receiverId) {
            socket.emit(
                "send_dm",
                {
                    receiverId: payload.receiverId,
                    message: payload.message,
                    type: payload.type || "text",
                    messageType: payload.messageType,
                    replyTo: payload.replyTo || null,
                    attachments: payload.attachments || [],
                },
                ack
            );
        } else if (payload.channelId) {
            socket.emit(
                "send_channel_message",
                {
                    channelId: payload.channelId,
                    message: payload.message,
                    type: payload.type || "text",
                    messageType: payload.messageType,
                    replyTo: payload.replyTo || null,
                    attachments: payload.attachments || [],
                },
                ack
            );
        } else {
            reject(new Error("Missing channelId or receiverId"));
        }
    });
};

/* ================================
   CALLING (EMITTERS)
================================ */

export const callUser = (payload: {
    toUserId: string;
    offer: RTCSessionDescriptionInit;
}) => {
    socket?.emit("call-user", payload);
};

export const answerCall = (payload: {
    toUserId: string;
    answer: RTCSessionDescriptionInit;
}) => {
    socket?.emit("answer-call", payload);
};

export const sendIceCandidate = (payload: {
    toUserId: string;
    candidate: RTCIceCandidateInit;
}) => {
    socket?.emit("ice-candidate", payload);
};

export const endCall = (payload: {
    toUserId: string;
}) => {
    socket?.emit("end-call", payload);
};

/* ================================
   MESSAGE LISTENERS
================================ */

export const onNewChannelMessage = (cb: (msg: ApiChatMessage) => void) => {
    socket?.on("channel_message_new", cb);
};

export const onNewDM = (cb: (msg: ApiChatMessage) => void) => {
    socket?.on("dm_new", cb);
};

export const offNewChannelMessage = (cb?: (msg: ApiChatMessage) => void) => {
    if (cb) {
        socket?.off("channel_message_new", cb);
    } else {
        socket?.off("channel_message_new");
    }
};

export const offNewDM = (cb?: (msg: ApiChatMessage) => void) => {
    if (cb) {
        socket?.off("dm_new", cb);
    } else {
        socket?.off("dm_new");
    }
};

/* ================================
   CALLING (LISTENERS)
================================ */

export const onIncomingCall = (
    cb: (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => void
) => {
    socket?.on("incoming-call", cb);
};

export const onCallAnswered = (
    cb: (data: { answer: RTCSessionDescriptionInit }) => void
) => {
    socket?.on("call-answered", cb);
};

export const onIceCandidate = (
    cb: (data: { candidate: RTCIceCandidateInit }) => void
) => {
    socket?.on("ice-candidate", cb);
};

export const onCallEnded = (cb: () => void) => {
    socket?.on("call-ended", cb);
};

export const offIncomingCall = () => {
    socket?.off("incoming-call");
};

export const offCallAnswered = () => {
    socket?.off("call-answered");
};

export const offIceCandidate = () => {
    socket?.off("ice-candidate");
};

export const offCallEnded = () => {
    socket?.off("call-ended");
};

/* ================================
   DM API CALLS
================================ */

export const getUserDMs = async (): Promise<ApiChannel[]> => {
    const res = await axiosGet("/team-chat/dms");
    return res.data.data;
};
