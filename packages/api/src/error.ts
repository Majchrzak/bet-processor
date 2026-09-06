export const InternalServerErrorMessage = {
  message: "internal server error message",
};

export const ForbiddenMessage = {
  message: "forbidden",
};

export const RequestBodyTooLargeMessage = {
  message: "request body too large",
};

export const WalletNotFoundMessage = {
  code: 99,
  message: "wallet not found",
};

export const InsufficientFundsMessage = {
  code: 100,
  message: "Player has not enough funds to process an action",
};

export const GameAlreadyFinishedMessage = {
  code: 101,
  message: "Game is already finished",
};

export const InvalidRequestMessage = {
  code: 102,
  message: "invalid request",
};

export const TooManyActionsMessage = {
  code: 108,
  message: "too many actions in request",
};

export const TimeRangeTooLargeMessage = {
  code: 103,
  message: `report range must not exceed days`,
};

export const InvalidTimeOrderMessage = {
  code: 104,
  message: "from must be earlier than to",
};

export const InvalidTimeParameterMessage = {
  code: 105,
  message: "invalid time parameter",
};

export const CursorTimeWindowMismatchMessage = {
  code: 106,
  message: "cursor does not match report window",
};

export const CursorMalformedMessage = {
  code: 107,
  message: "cursor malformed",
};
