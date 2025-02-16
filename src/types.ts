export type RequestCodeParams = {
    phoneNumber: string,
    onError: () => void,
}

export type AuthenticateParams = {
    phoneNumber: string,
    phoneCode: string,
    phoneCodeHash: string,
    onError: () => void,
}

export enum InputMode {
    IDLE = 'idle',
    WAITING_PHONE = 'waiting_phone',
    WAITING_CODE = 'waiting_code',
    WAITING_TEMPLATE = 'waiting_template',
}

export enum BotActions {
    SET_TEMPLATE = 'set_template',
    VIEW_TEMPLATE = 'view_template',
    ACCEPT = 'accept',
    DECLINE = 'decline',
}

export enum BotCommands {
    START = 'start',
    LOGIN = 'login',
    TEMPLATE = 'template',
}

export interface UserState {
    inputMode?: InputMode
    phone?: string;
    replyTo?: { [messageId: number]: number }
}

export type ForwardOrigin = {
    forward_origin: {
        sender_user: {
            id: number
        }
    }
};

export interface Client {
    sendCode: () => void
    signIn: () => void
}
