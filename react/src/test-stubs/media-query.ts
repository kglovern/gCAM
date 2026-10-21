/** Live matchMedia fixture for responsive hooks and rotation tests. */
export function mockMediaQuery(initial: boolean) {
    let matches = initial;
    const original = window.matchMedia;
    const queries = new Map<string, MediaQueryList>();
    window.matchMedia = (query: string) => {
        let media = queries.get(query);
        if (!media) {
            media = Object.assign(new EventTarget(), {
                media: query,
                matches,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
            }) as MediaQueryList;
            Object.defineProperty(media, 'matches', { get: () => matches });
            queries.set(query, media);
        }
        return media;
    };
    return {
        change(next: boolean) {
            matches = next;
            for (const media of queries.values())
                media.dispatchEvent(new Event('change'));
        },
        restore() {
            window.matchMedia = original;
        },
    };
}
