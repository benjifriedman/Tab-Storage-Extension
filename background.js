let storageFile = null;

// Add listeners when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
	console.log('Extension installed or updated.');
	// Initialize storage with empty tab data if it doesn't exist yet
	chrome.storage.local.get(['tabData'], result => {
		if (!result.tabData) {
			chrome.storage.local.set({ tabData: [] });
		}
	});
});

chrome.runtime.onStartup.addListener(() => {
	console.log('Extension starting up');
	chrome.storage.local.get(['storageFilePath'], result => {
		if (result.storageFilePath) {
			console.log('Found stored file path on startup:', result.storageFilePath);
			storageFile = result.storageFilePath;
		} else {
			console.log('No storage file found, will prompt user');
			chrome.action.openPopup();
		}
	});
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('Background received message:', message);

	try {
		if (message.action === 'viewSavedTabs') {
			console.log('View saved tabs requested');
			// Direct approach - create a new tab with the tablist page
			chrome.tabs.create({ url: chrome.runtime.getURL('tablist.html') }, newTab => {
				console.log('Created tablist tab:', newTab.id);
				sendResponse({ success: true });
			});
			return true; // Required for async response
		} else if (message.action === 'saveCurrentTab') {
			console.log('Saving current tab');
			if (message.tab) {
				saveTab(message.tab, message.closeAfterSave || false);
				sendResponse({ success: true });

				if (message.showTabList) {
					showTabList();
				}
			} else {
				sendResponse({ success: false, error: 'No tab data provided' });
			}
		} else if (message.action === 'saveAllTabs') {
			console.log('Saving all tabs from current window');

			chrome.tabs.query({ currentWindow: true }, function (tabs) {
				try {
					console.log('Found', tabs.length, 'tabs in current window');

					// Filter out extension tabs
					const nonExtensionTabs = tabs.filter(tab => !tab.url.startsWith('chrome-extension://'));
					console.log('Filtered to', nonExtensionTabs.length, 'non-extension tabs');

					// First, get existing tabs from storage
					chrome.storage.local.get(['tabData'], function (result) {
						const existingTabData = result.tabData || [];
						console.log('Existing tabs in storage:', existingTabData.length);

						// Create new tab entries for all tabs at once
						const newTabEntries = nonExtensionTabs.map(tab => ({
							id: Date.now() + Math.floor(Math.random() * 1000) + Math.random(), // Ensure unique ID
							title: tab.title || 'Untitled Tab',
							url: tab.url,
							favicon: tab.favIconUrl,
							date: new Date().toISOString()
						}));

						console.log('Created new tab entries:', newTabEntries.length);

						// Combine existing and new tabs
						const updatedTabData = [...existingTabData, ...newTabEntries];

						// Save all tabs in a single operation
						chrome.storage.local.set({ tabData: updatedTabData }, function () {
							console.log('All tabs saved successfully. Total tabs in storage:', updatedTabData.length);

							// Now that all tabs are saved, close them if requested
							if (message.closeAfterSave) {
								console.log('Closing tabs after save');
								const tabIds = nonExtensionTabs.map(tab => tab.id);

								chrome.tabs.remove(tabIds, function () {
									if (chrome.runtime.lastError) {
										console.error('Error closing tabs:', chrome.runtime.lastError);
									}

									// Show tablist after saving if requested
									if (message.showTabList) {
										showTabList();
									}

									// Notify the tablist page to update
									notifyTabListToUpdate();
								});
							} else {
								// If not closing tabs, still update UI as needed
								if (message.showTabList) {
									showTabList();
								}
								notifyTabListToUpdate();
							}

							sendResponse({
								success: true,
								count: newTabEntries.length,
								message: `Saved ${newTabEntries.length} tabs`
							});
						});
					});
				} catch (err) {
					console.error('Error processing tabs:', err);
					sendResponse({ success: false, error: err.message });
				}
			});

			return true; // Required for async response
		} else if (message.action === 'createNewStorageFile') {
			createNewStorageFile()
				.then(response => {
					sendResponse(response);
				})
				.catch(error => {
					sendResponse({ success: false, error: error.message });
				});
			return true;
		} else if (message.action === 'setStorageFile') {
			console.log('Setting storage file from external content');
			// Implementation for loading a storage file
			if (message.fileContent) {
				try {
					console.log('Parsing file content');
					const tabData = JSON.parse(message.fileContent);

					console.log('Setting storage with parsed data, count:', tabData.length);
					chrome.storage.local.set(
						{
							tabData: tabData,
							storageFilePath: message.filename
						},
						() => {
							if (chrome.runtime.lastError) {
								console.error('Error saving to storage:', chrome.runtime.lastError);
								sendResponse({
									success: false,
									error: chrome.runtime.lastError.message
								});
							} else {
								console.log('Storage file set successfully');
								sendResponse({ success: true });
							}
						}
					);
					return true; // for async response
				} catch (error) {
					console.error('Error parsing file content:', error);
					sendResponse({ success: false, error: error.message });
				}
			} else {
				console.error('No file content provided');
				sendResponse({ success: false, error: 'No file content provided' });
			}
			return true;
		} else if (message.action === 'exportTabsToFile') {
			exportTabsToFile()
				.then(response => {
					sendResponse(response);
				})
				.catch(error => {
					sendResponse({ success: false, error: error.message });
				});
			return true;
		} else if (message.action === 'deleteTab') {
			console.log('Deleting tab with ID:', message.tabId);

			chrome.storage.local.get(['tabData'], function (result) {
				const tabData = result.tabData || [];
				const updatedTabData = tabData.filter(tab => tab.id !== message.tabId);

				chrome.storage.local.set({ tabData: updatedTabData }, function () {
					console.log('Tab deleted');
					sendResponse({ success: true });
				});
			});

			return true; // Required for async response
		} else {
			// No action matched
			sendResponse({ success: false, error: 'Unknown action' });
		}
	} catch (err) {
		console.error('Error processing message:', err);
		sendResponse({ success: false, error: err.message });
	}

	return true; // Required for async response
});

// Function to save a tab
function saveTab(tab, closeAfterSave = false) {
	console.log('Saving tab:', tab, 'Close after save:', closeAfterSave);

	// Get existing tabs from storage
	chrome.storage.local.get(['tabData'], function (result) {
		const tabData = result.tabData || [];

		// Create a new tab entry
		const tabEntry = {
			id: Date.now() + Math.floor(Math.random() * 1000), // Use timestamp plus random number as unique ID
			title: tab.title || 'Untitled Tab',
			url: tab.url,
			favicon: tab.favIconUrl,
			date: new Date().toISOString()
		};

		// Add tab to array
		tabData.push(tabEntry);

		// Save updated array back to storage
		chrome.storage.local.set({ tabData: tabData }, function () {
			console.log('Tab saved with ID:', tabEntry.id);

			// Close the tab if requested
			if (closeAfterSave) {
				console.log('Closing tab:', tab.id);
				chrome.tabs.remove(tab.id, function () {
					if (chrome.runtime.lastError) {
						console.error('Error closing tab:', chrome.runtime.lastError);
					}
				});
			}

			// Notify the tablist page to update if it's open
			notifyTabListToUpdate();
		});
	});
}

// Function to notify tablist page to update
function notifyTabListToUpdate() {
	// Use the more robust method to find tablist tabs
	const tablistUrlPattern = chrome.runtime.getURL('tablist.html');

	chrome.tabs.query({}, function (allTabs) {
		// Find all tablist tabs
		const tablistTabs = allTabs.filter(tab => tab.url === tablistUrlPattern || tab.url.startsWith(tablistUrlPattern));

		if (tablistTabs.length > 0) {
			console.log('Notifying', tablistTabs.length, 'tablist pages to update');
			tablistTabs.forEach(tab => {
				try {
					chrome.tabs.sendMessage(tab.id, { action: 'updateTabList' }).catch(err => console.log('Tab may not be ready for messages yet:', err));
				} catch (e) {
					console.log('Error sending message to tab:', e);
				}
			});
		}
	});
}

// Function to show the tablist page - fixed to properly check if already open
function showTabList() {
	console.log('showTabList called');

	// Get the tablist URL with wildcard to ensure matching works
	const tablistUrlPattern = chrome.runtime.getURL('tablist.html');
	console.log('Looking for existing tab with URL pattern:', tablistUrlPattern);

	// Query for tabs across all windows - not just the current one
	chrome.tabs.query({}, function (allTabs) {
		console.log('Found total tabs:', allTabs.length);

		// Find tabs that match our tablist URL
		const tablistTabs = allTabs.filter(tab => {
			const isMatch = tab.url === tablistUrlPattern || tab.url.startsWith(tablistUrlPattern);
			if (isMatch) {
				console.log('Found matching tab:', tab.id, tab.url);
			}
			return isMatch;
		});

		if (tablistTabs.length > 0) {
			// Use the first found tab
			const tabToFocus = tablistTabs[0];
			console.log('Tablist already open, focusing tab:', tabToFocus.id);

			// Focus the tab and its window
			chrome.tabs.update(tabToFocus.id, { active: true }, function () {
				chrome.windows.update(tabToFocus.windowId, { focused: true }, function () {
					console.log('Tab and window focused');

					// Force a refresh of the tab content
					chrome.tabs.reload(tabToFocus.id, function () {
						console.log('Tab reloaded');
					});
				});
			});
		} else {
			console.log('No existing tablist tab found, creating new one');
			// Create a new tab and move it to the first position
			chrome.tabs.create({ url: 'tablist.html' }, function (newTab) {
				// Move the tab to the first position (index 0)
				chrome.tabs.move(newTab.id, { index: 0 }, function (movedTab) {
					console.log('Tablist tab created and moved to first position');
				});
			});
		}
	});
}

// Handle browser action click
chrome.action.onClicked.addListener(tab => {
	console.log('Browser action clicked');
	// Direct approach - create a new tab with the tablist page
	chrome.tabs.create({ url: chrome.runtime.getURL('tablist.html') });
});

async function saveTabs(onlyCurrent) {
	console.log('saveTabs called with onlyCurrent =', onlyCurrent);

	try {
		let tabs;
		if (onlyCurrent) {
			// Get only the active tab in the current window
			const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			tabs = [activeTab];
		} else {
			// Get all tabs in the current window
			tabs = await chrome.tabs.query({ currentWindow: true });
		}

		console.log('Retrieved tabs:', tabs);

		// Filter out the tablist.html tab and extension pages
		tabs = tabs.filter(tab => !tab.url.includes('tablist.html') && !tab.url.startsWith(chrome.runtime.getURL('')));

		console.log('Filtered tabs to save:', tabs);

		// Create tab data objects
		let newTabData = tabs.map(tab => ({
			id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
			title: tab.title || 'Untitled',
			url: tab.url,
			date: new Date().toISOString(),
			protocol: new URL(tab.url).protocol // Store the protocol to help with special URLs
		}));

		console.log('Created tab data:', newTabData);

		// Get existing data from local storage
		const result = await chrome.storage.local.get(['tabData']);
		let existingData = result.tabData || [];
		console.log('Loaded existing data from storage:', existingData);

		// Combine existing and new data
		const combinedData = [...existingData, ...newTabData];
		console.log('Combined tab data:', combinedData);

		// Store in local storage - this is now our primary storage
		await chrome.storage.local.set({ tabData: combinedData });

		// Close the tabs that were saved (if any tabs were found)
		if (tabs && tabs.length > 0) {
			const tabIds = tabs.map(tab => tab.id);
			console.log('Closing tabs with IDs:', tabIds);
			await chrome.tabs.remove(tabIds);
		}

		// Open or update the tab list
		openTabList();
	} catch (error) {
		console.error('Error in saveTabs:', error);
		throw error; // Rethrow to be caught by the caller
	}
}

async function openTabList() {
	try {
		console.log('Opening tab list');

		// Check if tablist.html is already open
		const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('tablist.html') });

		if (tabs.length > 0) {
			// If the tab is already open, reload it
			console.log('Tab list already open, reloading it');
			await chrome.tabs.reload(tabs[0].id);
			await chrome.tabs.update(tabs[0].id, { active: true });
		} else {
			// Otherwise, open a new tab
			console.log('Opening new tab list');
			await chrome.tabs.create({ url: 'tablist.html' });
		}

		return { success: true };
	} catch (error) {
		console.error('Error opening tab list:', error);
		throw error; // Rethrow to be caught by the caller
	}
}

async function createNewStorageFile() {
	try {
		console.log('Creating new storage file');

		// Get current tab data
		const result = await chrome.storage.local.get(['tabData']);
		const currentData = result.tabData || [];

		// Convert data to JSON string
		const jsonString = JSON.stringify(currentData, null, 2);

		// Generate a data URL for the JSON
		const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

		// Use downloads API to save the file
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `saved_tabs_${timestamp}.json`;

		console.log('Starting download of storage file');
		const downloadId = await chrome.downloads.download({
			url: dataUrl,
			filename: filename,
			saveAs: true
		});

		console.log('Download initiated with ID:', downloadId);

		// Add a listener for when the download completes
		return new Promise(resolve => {
			const downloadListener = function (delta) {
				if (delta.id === downloadId && delta.state) {
					console.log(`Download state changed: ${delta.state.current}`, delta);

					// Remove the listener first to prevent multiple callbacks
					chrome.downloads.onChanged.removeListener(downloadListener);

					if (delta.state.current === 'complete') {
						// Download completed, now get the file path
						chrome.downloads.search({ id: downloadId }, function (downloads) {
							if (downloads && downloads.length > 0) {
								const filePath = downloads[0].filename;
								console.log('Download completed, path:', filePath);

								// Store the file path
								chrome.storage.local.set({ storageFilePath: filePath }, function () {
									console.log('Storage file path saved:', filePath);
									resolve({ success: true, path: filePath });
								});
							} else {
								console.log('Download completed but file info not available');
								resolve({ success: true });
							}
						});
					} else if (delta.state.current === 'interrupted' || delta.state.current === 'canceled') {
						// User likely canceled the download - fail silently
						console.log('Download was interrupted or canceled by user');
						resolve({ success: false, silentFailure: true });
					} else {
						// Any other state, also fail silently
						console.log('Download ended in state:', delta.state.current);
						resolve({ success: false, silentFailure: true });
					}
				}
			};

			console.log('Adding download change listener');
			chrome.downloads.onChanged.addListener(downloadListener);

			// Also add a safety timeout to ensure we clean up if something goes wrong
			setTimeout(() => {
				console.log('Download timeout safety triggered');
				// Check if listener is still active
				if (chrome.downloads.onChanged.hasListener(downloadListener)) {
					console.log('Removing download listener due to timeout');
					chrome.downloads.onChanged.removeListener(downloadListener);

					// Don't resolve again if already resolved
					resolve({
						success: false,
						silentFailure: true,
						message: 'Download timed out or was canceled'
					});
				}
			}, 60000); // 1 minute timeout
		});
	} catch (error) {
		console.error('Error creating new storage file:', error);
		return { success: false, silentFailure: true, error: error.message };
	}
}

// New helper function for tablist file loading
async function setStorageFileWithContent(filename, content) {
	try {
		// Parse the content
		const tabData = JSON.parse(content);

		// Store the file path and data
		await chrome.storage.local.set({
			storageFilePath: filename,
			tabData: tabData
		});

		console.log('Storage file set with content:', filename);
		return { success: true };
	} catch (error) {
		console.error('Error setting storage file with content:', error);
		throw error;
	}
}

async function setStorageFile(filename) {
	// We would implement file loading here, but for security reasons,
	// we can't directly read files from the file system in MV3 extensions.
	// The user needs to manually select the file, which is handled by the popup.
	return { success: true, message: 'File selection handled by popup' };
}

async function exportTabsToFile() {
	try {
		console.log('Exporting tabs to file');

		// Get the current tabs from storage
		const result = await chrome.storage.local.get(['tabData']);
		const tabs = result.tabData || [];

		// Convert data to JSON string
		const jsonString = JSON.stringify(tabs, null, 2);

		// Generate a data URL for the JSON
		const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

		// Generate a filename with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `tabs_export_${timestamp}.json`;

		// Download the file
		await chrome.downloads.download({
			url: dataUrl,
			filename: filename,
			saveAs: true
		});

		console.log('Tabs exported successfully');
		return { success: true };
	} catch (error) {
		console.error('Error exporting tabs to file:', error);
		throw error;
	}
}

// Fix the saveAllTabs function in background.js
function saveAllTabs(closeAfterSave = false, showTabList = false) {
	console.log('Saving all tabs, close after save:', closeAfterSave);

	chrome.tabs.query({}, function (tabs) {
		console.log('Found', tabs.length, 'tabs to save');

		if (tabs.length === 0) {
			console.log('No tabs to save');
			if (showTabList) {
				showTabList();
			}
			return;
		}

		// Get current tab data from storage
		chrome.storage.local.get(['tabData'], function (result) {
			let tabData = result.tabData || [];
			const originalTabCount = tabData.length;

			// Collect tab IDs for later closing
			const tabIdsToClose = [];

			// Create entries for all tabs
			tabs.forEach(tab => {
				// Skip the extension's own tabs
				if (tab.url.includes(chrome.runtime.id)) {
					console.log('Skipping extension tab:', tab.url);
					return;
				}

				// Add tab to close list if needed
				if (closeAfterSave) {
					tabIdsToClose.push(tab.id);
				}

				// Create a new tab entry
				const tabEntry = {
					id: Date.now() + Math.floor(Math.random() * 1000) + tabData.length, // Ensure unique ID
					title: tab.title,
					url: tab.url,
					favicon: tab.favIconUrl,
					date: new Date().toISOString()
				};

				// Add to tab data array
				tabData.push(tabEntry);
			});

			// Calculate how many new tabs were added
			const newTabsAdded = tabData.length - originalTabCount;
			console.log('Added', newTabsAdded, 'new tabs to storage');

			// Save all tab data
			chrome.storage.local.set({ tabData: tabData }, function () {
				console.log('All tabs saved successfully');

				// Close tabs if requested
				if (closeAfterSave && tabIdsToClose.length > 0) {
					console.log('Closing', tabIdsToClose.length, 'tabs');
					chrome.tabs.remove(tabIdsToClose, function () {
						if (chrome.runtime.lastError) {
							console.error('Error closing tabs:', chrome.runtime.lastError);
						}

						// Show tab list if requested
						if (showTabList) {
							showTabList();
						}
					});
				} else if (showTabList) {
					showTabList();
				}

				// Notify the tablist page to update if it's open
				notifyTabListToUpdate();
			});
		});
	});
}
