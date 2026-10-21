#import "GcamFiles.h"

@interface GcamFiles ()
@property(nonatomic, copy) NSString *pending;
@property(nonatomic, strong) NSURL *temporaryDirectory;
@end

@implementation GcamFiles
- (void)save:(CDVInvokedUrlCommand *)command {
    if (self.pending) {
        [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Another export is still open."] callbackId:command.callbackId];
        return;
    }
    self.pending = command.callbackId;
    NSString *name = [command.arguments[0] lastPathComponent];
    NSString *text = command.arguments[1];
    self.temporaryDirectory = [[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES] URLByAppendingPathComponent:[[NSUUID UUID] UUIDString] isDirectory:YES];
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtURL:self.temporaryDirectory withIntermediateDirectories:YES attributes:nil error:&error];
    NSURL *file = [self.temporaryDirectory URLByAppendingPathComponent:name];
    if (error || ![text writeToURL:file atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        [self finish:error.localizedDescription ?: @"Export failed."];
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        UIDocumentPickerViewController *picker = [[UIDocumentPickerViewController alloc] initForExportingURLs:@[file] asCopy:YES];
        picker.delegate = self;
        [self.viewController presentViewController:picker animated:YES completion:nil];
    });
}
- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls { [self finish:nil]; }
- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller { [self finish:@"CANCELLED"]; }
- (void)finish:(NSString *)error {
    if (self.pending) {
        CDVPluginResult *result = error ? [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error] : [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
        [self.commandDelegate sendPluginResult:result callbackId:self.pending];
    }
    if (self.temporaryDirectory) [[NSFileManager defaultManager] removeItemAtURL:self.temporaryDirectory error:nil];
    self.pending = nil;
    self.temporaryDirectory = nil;
}
- (void)onReset { [self finish:@"CANCELLED"]; }
@end
