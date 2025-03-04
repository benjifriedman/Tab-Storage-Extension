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
								showStatus('Error: ' + chrome.runtime.lastError.message);
								return;
							}

							if (response && response.success) {
								console.log('Tab saved successfully');
								showStatus('Tab saved!');
							} else {
								console.error('Error saving tab:', response?.error);
								showStatus('Error saving tab');
							}
						}
					);
				} catch (err) {
					console.error('Error in saveCurrentTab:', err);
					showStatus('Error: ' + err.message);
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
						showStatus('Error: ' + chrome.runtime.lastError.message);
						return;
					}

					if (response && response.success) {
						console.log(`Saved ${response.count} tabs`);
						showStatus(`Saved ${response.count} tabs`);
					} else {
						console.error('Error saving tabs:', response?.error);
						showStatus('Error saving tabs');
					}
				}
			);
		} catch (err) {
			console.error('Error in saveAllTabs:', err);
			showStatus('Error: ' + err.message);
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
			openTabsList();
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

function showStatus(message) {
	const statusElement = document.getElementById('status');
	statusElement.textContent = message;

	// Clear the status after 2 seconds
	setTimeout(function () {
		statusElement.textContent = '';
	}, 2000);
}

// Additional logging to catch any errors
window.onerror = function (message, source, lineno, colno, error) {
	console.error('Error in popup.js:', message, 'at', source, lineno, colno, error);
	return false;
};
