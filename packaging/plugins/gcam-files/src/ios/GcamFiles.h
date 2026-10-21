#import <Cordova/CDVPlugin.h>
#import <UIKit/UIKit.h>

@interface GcamFiles : CDVPlugin <UIDocumentPickerDelegate>
- (void)save:(CDVInvokedUrlCommand *)command;
@end
