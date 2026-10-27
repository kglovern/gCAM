#import "GcamUpdates.h"
#import <UIKit/UIKit.h>

@implementation GcamUpdates
- (void)open:(CDVInvokedUrlCommand *)command {
    NSString *value = command.arguments.firstObject;
    NSURLComponents *parts = [value isKindOfClass:[NSString class]] ? [NSURLComponents componentsWithString:value] : nil;
    BOOL apple = [parts.host isEqualToString:@"apps.apple.com"] || [parts.host isEqualToString:@"testflight.apple.com"];
    if (!apple || ![parts.scheme isEqualToString:@"https"] || parts.user || parts.password || parts.port) {
        [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Invalid Apple update URL."] callbackId:command.callbackId];
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:parts.URL options:@{} completionHandler:^(BOOL success) {
            [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:success ? CDVCommandStatus_OK : CDVCommandStatus_ERROR] callbackId:command.callbackId];
        }];
    });
}
@end
