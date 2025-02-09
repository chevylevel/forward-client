export type RequestCodeParams = {
    phoneNumber: string,
    onError: () => void,
}

export type AuthenticateParams = {
    phoneNumber: string,
    code: string,
    onError: () => void,
}
