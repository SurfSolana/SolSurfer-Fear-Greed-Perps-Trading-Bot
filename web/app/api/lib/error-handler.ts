import { NextResponse } from 'next/server'

export interface ErrorResponse {
  success: false
  error: string
  errorCode?: string
  details?: any
  timestamp: string
}

export function getUserFriendlyMessage(error: any): string {
  // Common PM2 errors
  if (error.message?.includes('PM2')) {
    if (error.message.includes('not found')) {
      return 'Trading bot process not found. Please ensure PM2 is running.'
    }
    if (error.message.includes('already running')) {
      return 'Trading bot is already running.'
    }
    if (error.message.includes('connect')) {
      return 'Unable to connect to PM2 process manager. Please check PM2 status.'
    }
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return 'Configuration or state file not found.'
  }
  if (error.code === 'EACCES') {
    return 'Permission denied accessing required files.'
  }

  // Network errors
  if (error.code === 'ECONNREFUSED') {
    return 'Connection refused. Service may be down.'
  }
  if (error.code === 'ETIMEDOUT') {
    return 'Request timed out. Please try again.'
  }

  // Validation errors
  if (error.message?.includes('leverage')) {
    return error.message
  }
  if (error.message?.includes('threshold')) {
    return error.message
  }

  // Default message
  return error.message || 'An unexpected error occurred'
}

export function getErrorCode(error: any): string {
  if (error.code) return error.code
  if (error.message?.includes('PM2')) return 'PM2_ERROR'
  if (error.message?.includes('validation')) return 'VALIDATION_ERROR'
  if (error.message?.includes('not found')) return 'NOT_FOUND'
  return 'UNKNOWN_ERROR'
}

export function getHttpStatus(error: any): number {
  // Client errors (4xx)
  if (error.status) return error.status
  if (error.message?.includes('not found')) return 404
  if (error.message?.includes('already running')) return 409
  if (error.message?.includes('validation')) return 400
  if (error.message?.includes('leverage') || error.message?.includes('threshold')) return 400
  if (error.code === 'EACCES') return 403

  // Server errors (5xx)
  if (error.code === 'ECONNREFUSED') return 503
  if (error.code === 'ETIMEDOUT') return 504

  return 500
}

export function handleApiError(
  endpoint: string,
  error: any,
  requestContext?: any
): NextResponse {
  // Log detailed error for debugging
  console.error(`[${endpoint}] Error:`, {
    message: error.message,
    stack: error.stack,
    code: error.code,
    timestamp: new Date().toISOString(),
    context: requestContext
  })

  // Return user-friendly error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: getUserFriendlyMessage(error),
    errorCode: getErrorCode(error),
    timestamp: new Date().toISOString()
  }

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = {
      originalMessage: error.message,
      stack: error.stack
    }
  }

  return NextResponse.json(errorResponse, {
    status: getHttpStatus(error)
  })
}

export function createSuccessResponse(data: any, message?: string): NextResponse {
  return NextResponse.json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  })
}