// Build-time adapter of the pinned upstream's pure modules; no Node runtime enters the app.
declare module 'virtual:ios-netease-routes' {
    const routes: Record<string, unknown>;
    export default routes;
}
