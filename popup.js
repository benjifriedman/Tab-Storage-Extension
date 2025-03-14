// Immediately log that the script is executing
console.log('Popup script starting execution');

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
	console.log('DOM content loaded');

	// Simple function to open tabs list
	function openTabsList() {
		console.log('Opening tabs list');
		const url = chrome.runtime.getURL('tablist.html');
		console.log('Tabs list URL:', url);

		// Using Chrome API to create a new tab
		chrome.tabs.create({ url: url }, function (tab) {
			console.log('New tab created with ID:', tab?.id);
			window.close(); // Close popup
		});
	}

	// Function to save current tab
	function saveCurrentTab() {
		console.log('Save current tab clicked');

		chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
			if (tabs.length > 0) {
				try {
					chrome.runtime.sendMessage(
						{
							action: 'saveCurrentTab',
							tab: tabs[0],
							closeAfterSave: true,
							showTabList: true
						},
						function (response) {
							if (chrome.runtime.lastError) {
								console.error('Error:', chrome.runtime.lastError);
								return;
							}

							// Close the popup
							window.close();
						}
					);
				} catch (err) {
					console.error('Error in saveCurrentTab:', err);
					window.close();
				}
			}
		});
	}

	// Function to save all tabs
	function saveAllTabs() {
		console.log('Save all tabs clicked');

		try {
			chrome.runtime.sendMessage(
				{
					action: 'saveAllTabs',
					closeAfterSave: true,
					showTabList: true
				},
				function (response) {
					if (chrome.runtime.lastError) {
						console.error('Error:', chrome.runtime.lastError);
						return;
					}

					// Close the popup
					window.close();
				}
			);
		} catch (err) {
			console.error('Error in saveAllTabs:', err);
			window.close();
		}
	}

	// Get buttons references - use both possible IDs to be safe
	const saveCurrentButton = document.getElementById('saveCurrentTab');
	const saveAllButton = document.getElementById('saveAllTabs');

	// Try both possible IDs for the view tabs button
	let viewTabsButton = document.getElementById('openTabList'); // Original ID
	if (!viewTabsButton) {
		viewTabsButton = document.getElementById('viewSavedTabs'); // New ID
	}

	// Log button status
	console.log('Button elements found:', {
		saveCurrentButton: !!saveCurrentButton,
		saveAllButton: !!saveAllButton,
		viewTabsButton: !!viewTabsButton,
		viewTabsButtonId: viewTabsButton ? viewTabsButton.id : 'not found'
	});

	// Add click listeners
	if (saveCurrentButton) {
		saveCurrentButton.addEventListener('click', saveCurrentTab);
	}

	if (saveAllButton) {
		saveAllButton.addEventListener('click', saveAllTabs);
	}

	if (viewTabsButton) {
		console.log('Adding click listener to view tabs button with ID:', viewTabsButton.id);
		viewTabsButton.addEventListener('click', function (e) {
			console.log('View tabs button clicked', e);
			viewSavedTabs();
		});
	} else {
		console.error('View saved tabs button not found with either ID!');

		// Last resort - log all buttons on the page to help debug
		document.querySelectorAll('button').forEach((btn, i) => {
			console.log(`Button ${i}:`, btn.id, btn.textContent.trim());
		});
	}

	console.log('All event listeners attached');
});

// Additional logging to catch any errors
window.onerror = function (message, source, lineno, colno, error) {
	console.error('Error in popup.js:', message, 'at', source, lineno, colno, error);
	return false;
};

function viewSavedTabs() {
	console.log('View saved tabs clicked');

	// Get the tablist URL
	const tablistUrlPattern = chrome.runtime.getURL('tablist.html');
	console.log('Looking for existing tab with URL pattern:', tablistUrlPattern);

	// Check all windows for an existing tablist tab
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
					// Close the popup
					window.close();
				});
			});
		} else {
			console.log('No existing tablist tab found, creating new one');
			// Create a new tab and move it to the first position
			chrome.tabs.create({ url: 'tablist.html' }, function (newTab) {
				// Move the tab to the first position (index 0)
				chrome.tabs.move(newTab.id, { index: 0 }, function (movedTab) {
					console.log('Tablist tab created and moved to first position');
					// Close the popup
					window.close();
				});
			});
		}
	});
}
