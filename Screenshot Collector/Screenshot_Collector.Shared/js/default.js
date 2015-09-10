// For an introduction to the Blank template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkID=392286
(function () {
    "use strict";

    var activation = Windows.ApplicationModel.Activation;
    var shareOperation;
    var model = WinJS.Binding.as({
        fileName: "Screenshot",
        ready: false,
        quickLink: true,
        quickLinkId: "",
        imageInClipboard: false,
    });

    WinJS.Namespace.define("app.share", {
        items: new WinJS.Binding.List()
    });

    WinJS.Namespace.define("app.binding", {
        disabled: WinJS.Binding.converter(function (value) {
            return !value;
        })
    });

    // Clipboard module
    var pendingClipboardChange = false;
    var hasClipboardAccess = false;

    window.addEventListener("focus", function(event) {
        hasClipboardAccess = true;
        if (pendingClipboardChange) {
            updateFromClipboard();
        }
    });

    window.addEventListener("blur", function (event) {
        hasClipboardAccess = false;
    });

    function updateFromClipboard() {
        try {
            var dataPackageView = Windows.ApplicationModel.DataTransfer.Clipboard.getContent();
            WinJS.Application.queueEvent({ type: "clipboardchanged", dataPackageView: dataPackageView });
            pendingClipboardChange = false;
        } catch (e) {
            console.error("Could not access clipboard");
        }
    }

    function watchClipboard() {
        // Get the content from clipboard
        try {
            Windows.ApplicationModel.DataTransfer.Clipboard.addEventListener("contentchanged", function () {
                pendingClipboardChange = true;
                if (hasClipboardAccess) {
                    updateFromClipboard();
                }
            });
            if (hasClipboardAccess) {
                updateFromClipboard();
            }
        } catch (e) {
            console.error("onactivated: Could not access clipboard");
        }
    }

    WinJS.Application.addEventListener("clipboardchanged", function (event) {
        if (event.dataPackageView.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.bitmap)) {
            createItem(event.dataPackageView, { title: "From Clipboard" }); //i18n
            model.quickLink = true;
        }
    });

    WinJS.Application.onactivated = function (args) {
        args.setPromise(WinJS.UI.processAll()
            .then(function () {
            WinJS.Binding.processAll(document.body, model, false)
            .then(function () {
                var listView = document.getElementById("items").winControl;
                listView.addEventListener("selectionchanged", function (event) {
                    model.ready = listView.selection.count() > 0;
                });
            });
        }));
        args.detail.splashScreen.addEventListener("dismissed", function () {
            watchClipboard();
        });
        if (args.detail.kind === activation.ActivationKind.launch) {
            model.context = "launch";
            if (args.detail.previousExecutionState !== activation.ApplicationExecutionState.terminated) {
                // TODO: This application has been newly launched. Initialize
            } else {
                // TODO: This application was suspended and then terminated.
            }            
        } else if (args.detail.kind === activation.ActivationKind.shareTarget) {
            shareOperation = args.detail.shareOperation;
            model.context = "share";
            model.fileName = shareOperation.data.properties.title;
            model.quickLink = shareOperation.quickLinkId !== "";
            model.quickLinkId = shareOperation.quickLinkId;
            model.ready = true;
            WinJS.Application.queueEvent({ type: "shareready" });
        }
    };

    function createThumbnailAsync(imageStream) {
        var imageDecoder, inMemoryStream;
        return Windows.Graphics.Imaging.BitmapDecoder.createAsync(imageStream)
        .then(function (decoder) {
            imageDecoder = decoder;
            inMemoryStream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
            return Windows.Graphics.Imaging.BitmapEncoder.createForTranscodingAsync(inMemoryStream, imageDecoder);
        }).then(function (imageEncoder) {
            imageEncoder.bitmapTransform.scaledHeight = 120;
            imageEncoder.bitmapTransform.scaledWidth = 150;            
            return imageEncoder.flushAsync();
        }).then(function () {
            imageStream.close();
            return URL.createObjectURL(MSApp.createStreamFromInputStream("image/png", inMemoryStream), { oneTimeOnly: true });
        }).then(null, function (error) {
            console.error(error);
            imageStream && imageStream.close();
        });
    }

    function createItem(data, options) {
        var item = {
            uri: "",
            text: "",
            image: null,
        }
        Object.keys(options).forEach(function (key) {
            item[key] = options[key];
        });
        var uriPromise = data.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.webLink) ? data.getWebLinkAsync() : WinJS.Promise.as("");
        uriPromise
        .then(function (webLink) {
            item.uri = webLink.toString();
            return data.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.text) ? data.getTextAsync() : WinJS.Promise.as("");
        }).then(function (text) {
            item.text = text;
            return data.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.storageItems) ? data.getStorageItemsAsync() : WinJS.Promise.as(null);
        }).then(function (storageItems) {
            item.storageItems = storageItems;
            return data.getBitmapAsync();
        }).then(function (streamRef) {
            item.stream = streamRef;
            return streamRef.openReadAsync();
        }).then(createThumbnailAsync)
        .then(function (thumbnail) {
            item.thumbnail = thumbnail;
            app.share.items.push(item);
        });;
    }

    WinJS.Application.addEventListener("shareready", function (event) {
        /*WinJS.Promise.timeout(1000).then(function () {
            // Get the content from clipboard
            try {
                var dataPackageView = Windows.ApplicationModel.DataTransfer.Clipboard.getContent();
                if (dataPackageView.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.bitmap)) {
                    createItem(dataPackageView, "Clipboard") //i18n
                    model.quickLink = true;
                }
            } catch (e) {
            }
        });*/
        if (shareOperation.data.contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.bitmap)) {
            createItem(shareOperation.data, { title: shareOperation.data.properties.description });
        }        
    });

    function shareError(error) {
        shareOperation.reportError(error.message);
    }

    WinJS.Application.start();

    function saveStream(stream, storageFile) {
        var decoder, pixelData, outStream, encoder;
        return Windows.Graphics.Imaging.BitmapDecoder.createAsync(stream)
        .then(function (_decoder) {
            decoder = _decoder;
            return decoder.getPixelDataAsync();
        }).then(function (_pixelData) {
            pixelData = _pixelData;
            return storageFile.openAsync(Windows.Storage.FileAccessMode.readWrite);
        }).then(function (_outStream) {
            outStream = _outStream;
            return Windows.Graphics.Imaging.BitmapEncoder.createAsync(Windows.Graphics.Imaging.BitmapEncoder.pngEncoderId, outStream);
        }).then(function (encoder) {
            encoder.setPixelData(decoder.bitmapPixelFormat, Windows.Graphics.Imaging.BitmapAlphaMode.ignore, decoder.orientedPixelWidth, decoder.orientedPixelHeight, decoder.dpiX, decoder.dpiY, pixelData.detachPixelData());
            return encoder.flushAsync();
        }).then(function () {
            outStream.close();
        });
    }

    function saveItemsAsync(items) {
        return new WinJS.Promise(function (c, e, p) {
            Windows.Storage.KnownFolders.picturesLibrary.createFolderAsync("Screenshots", Windows.Storage.CreationCollisionOption.openIfExists)
            .then(function (saveFolder) {            
                return items.reduce(function (promise, item, index) {
                    return promise.then(function () {
                        if (item.data.storageItems) {
                            return item.data.storageItems.reduce(function (promise, storageItem) {
                                return promise.then(function () {
                                    storageItem.copyAsync(saveFolder, model.fileName + storageItem.fileType, Windows.Storage.NameCollisionOption.generateUniqueName);
                                });
                            }, WinJS.Promise.as());
                        } else if (item.data.stream) {
                            return saveFolder.createFileAsync("Screenshot.png", Windows.Storage.NameCollisionOption.generateUniqueName)
                            .then(function (storageFile) {
                                return item.data.stream.openReadAsync()
                                .then(function (stream) {
                                    return saveStream(stream, storageFile);
                                });
                            });
                        }
                    });
                }, WinJS.Promise.as())
            }).then(c,e);
        });        
    }

    function initialize() {
        document.getElementById("saveAndOpenMenuDropper").addEventListener("click", function (event) {
            document.getElementById("saveAndOpenMenu").winControl.show(event.target);
        });

        if (shareOperation) {
            document.getElementById("cancel").addEventListener("click", function () {
                shareOperation && shareOperation.dismissUI();
            });
        }
        var nameInput = document.getElementById("name");
        /*nameInput.addEventListener("input", function () {
            model.fileName = nameInput.value;
            model.ready = shareOperation && nameInput.value.trim().length > 0;
        });*/
        
        document.getElementById("save").addEventListener("click", function () {
            var listView = document.getElementById("items").winControl;
            listView.selection.getItems()
            .then(saveItemsAsync)
            .then(function () {
                if (shareOperation) {
                    //if (document.getElementById("quickLink").checked) {
                    //    var quickLink = new Windows.ApplicationModel.DataTransfer.ShareTarget.QuickLink();
                    //    quickLink.id = "clipboard";
                    //    quickLink.title = "Save Clipboard"; //i18n
                    //    var dataFormats = Windows.ApplicationModel.DataTransfer.StandardDataFormats;
                    //    quickLink.supportedDataFormats.replaceAll([dataFormats.bitmap]);
                    //    return Windows.ApplicationModel.Package.current.installedLocation.getFileAsync("images\\smalllogo.scale-100.png")
                    //    .then(function (iconFile) {
                    //        quickLink.thumbnail = Windows.Storage.Streams.RandomAccessStreamReference.createFromFile(iconFile);
                    //        return quickLink;
                    //    }, function (error) {
                    //        return null;
                    //    });
                    //} else if (model.quickLink) {
                    //    shareOperation.removeThisQuickLink();
                    //    return null;
                    //}
                }
            }).then(function (quickLink) {
                if (shareOperation) {
                    if (quickLink) {
                        shareOperation.reportCompleted(quickLink);
                    } else {
                        shareOperation.reportCompleted();
                    }
                }
            }).then(null, function (error) {
                shareError(error);
            });
        });
    }

    document.addEventListener("DOMContentLoaded", initialize, false);
})();