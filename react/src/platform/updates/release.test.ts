import { androidRelease, appleUpdateUrl, newerVersion } from './release';

test('compares stable versions numerically and excludes downgrades and malformed versions', () => {
    expect(newerVersion('0.10.0', '0.9.0')).toBe(true);
    for (const candidate of [
        '0.9.0',
        '0.8.0',
        '0.10.0-beta',
        '0.10',
        'NaN.0.0',
    ])
        expect(newerVersion(candidate, '0.9.0')).toBe(false);
});
test('offers only the exact APK asset from a newer public stable release', () => {
    const url =
        'https://github.com/petervanderwalt/gCAM/releases/download/v0.2.0/gCAM-0.2.0-android.apk';
    const release = {
        tag_name: 'v0.2.0',
        assets: [{ name: 'gCAM-0.2.0-android.apk', browser_download_url: url }],
    };
    expect(androidRelease(release, '0.1.0')).toEqual({ version: '0.2.0', url });
    expect(androidRelease(release, '0.2.0')).toBeNull();
    expect(androidRelease({ ...release, draft: true }, '0.1.0')).toBeNull();
    expect(
        androidRelease({ ...release, prerelease: true }, '0.1.0'),
    ).toBeNull();
    expect(
        androidRelease(
            {
                ...release,
                assets: [
                    {
                        ...release.assets[0],
                        browser_download_url: 'https://evil.test/app.apk',
                    },
                ],
            },
            '0.1.0',
        ),
    ).toBeNull();
    expect(androidRelease(null, '0.1.0')).toBeNull();
});
test('accepts Apple app links and rejects credentials and lookalike hosts', () => {
    expect(
        appleUpdateUrl('https://testflight.apple.com/join/AbCd123'),
    ).toBeTruthy();
    expect(
        appleUpdateUrl('https://apps.apple.com/us/app/gcam/id123456'),
    ).toBeTruthy();
    for (const value of [
        'https://testflight.apple.com.evil.test/join/a',
        'http://apps.apple.com/app/id1',
        'https://user@apps.apple.com/app/id1',
        'https://apps.apple.com:444/app/id1',
        null,
    ])
        expect(appleUpdateUrl(value)).toBeNull();
});
