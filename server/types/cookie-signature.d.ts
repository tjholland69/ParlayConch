declare module "cookie-signature" {
  export function sign(value: string, secret: string): string;
  export function unsign(value: string, secret: string): string | false;
}