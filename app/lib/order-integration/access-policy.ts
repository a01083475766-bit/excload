export const ORDER_INTEGRATION_ROOT_PATH = '/order/integration';

function pathnameOnly(path: string): string {
  const boundary = path.search(/[?#]/);
  return boundary === -1 ? path : path.slice(0, boundary);
}

export function isPublicOrderIntegrationPath(path: string): boolean {
  const pathname = pathnameOnly(path);
  return pathname === ORDER_INTEGRATION_ROOT_PATH || pathname === `${ORDER_INTEGRATION_ROOT_PATH}/`;
}

export function isProtectedOrderIntegrationPath(path: string): boolean {
  const pathname = pathnameOnly(path);
  return (
    pathname.startsWith(`${ORDER_INTEGRATION_ROOT_PATH}/`) &&
    !isPublicOrderIntegrationPath(pathname)
  );
}
