export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Not authorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class PaymentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class TenantIsolationError extends Error {
  constructor(message: string = 'Tenant isolation violation') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export function formatErrorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return {
      error: 'validation_error',
      message: error.message,
      field: error.field,
    };
  }

  if (error instanceof AuthenticationError) {
    return {
      error: 'authentication_error',
      message: error.message,
    };
  }

  if (error instanceof AuthorizationError) {
    return {
      error: 'authorization_error',
      message: error.message,
    };
  }

  if (error instanceof NotFoundError) {
    return {
      error: 'not_found',
      message: error.message,
    };
  }

  if (error instanceof ConflictError) {
    return {
      error: 'conflict',
      message: error.message,
    };
  }

  if (error instanceof PaymentError) {
    return {
      error: 'payment_error',
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof TenantIsolationError) {
    return {
      error: 'tenant_isolation_error',
      message: 'Access denied',
    };
  }

  if (error instanceof Error) {
    return {
      error: 'internal_error',
      message: 'An unexpected error occurred',
    };
  }

  return {
    error: 'internal_error',
    message: 'An unexpected error occurred',
  };
}
