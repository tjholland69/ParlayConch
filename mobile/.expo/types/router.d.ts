/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(tabs)` | `/(tabs)/dash` | `/(tabs)/leagues` | `/(tabs)/picks` | `/(tabs)/settings` | `/_sitemap` | `/dash` | `/leagues` | `/login` | `/picks` | `/settings`;
      DynamicRoutes: `/leagues/${Router.SingleRoutePart<T>}` | `/leagues/${Router.SingleRoutePart<T>}/build`;
      DynamicRouteTemplate: `/leagues/[id]` | `/leagues/[id]/build`;
    }
  }
}
