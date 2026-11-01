#import <Cordova/CDVPlugin.h>
#import <UIKit/UIKit.h>

@interface GcamFiles : CDVPlugin <UIDocumentPickerDelegate>
- (void)saveBinary:(CDVInvokedUrlCommand *)command;
- (void)save:(CDVInvokedUrlCommand *)command;
@end
