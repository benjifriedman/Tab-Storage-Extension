document.addEventListener('DOMContentLoaded', function () {
	console.log('DOM loaded, initializing tab list');
	loadTabs();

	// Set up event listeners
	document.getElementById('sortByDate').addEventListener('click', function () {
		sortTabs('date');
	});

	document.getElementById('sortByTitle').addEventListener('click', function () {
		sortTabs('title');
	});

	document.getElementById('sortByDomain').addEventListener('click', function () {
		sortTabs('domain');
	});

	// Search functionality
	document.getElementById('searchInput').addEventListener('input', function () {
		const searchTerm = this.value.toLowerCase();
		filterTabs(searchTerm);
	});

	// Storage file buttons
	document.getElementById('createStorageBtn').addEventListener('click', createNewStorageFile);
	document.getElementById('loadStorageBtn').addEventListener('click', function () {
		document.getElementById('loadStorage').click();
	});
	document.getElementById('loadStorage').addEventListener('change', loadStorageFile);
	document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);

	// Update storage path display
	updateStoragePathDisplay();

	// Listen for messages from background script
	chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
		console.log('Message received in tablist:', message);

		if (message.action === 'updateTabList') {
			console.log('Updating tab list due to message');
			loadTabs();
		}
	});
});

function loadTabs() {
	console.log('Loading tabs from storage');
	chrome.storage.local.get(['tabData', 'viewMode'], function (result) {
		const tabData = result.tabData || [];
		const viewMode = result.viewMode || 'date';

		// Display tabs in the appropriate view mode
		displayTabs(tabData, viewMode);
	});
}

function displayTabs(tabData, viewMode) {
	const tabsContainer = document.getElementById('tabsContainer');
	tabsContainer.innerHTML = '';

	if (tabData.length === 0) {
		tabsContainer.innerHTML = '<p class="empty-message">No saved tabs yet. Save some tabs from the extension popup.</p>';
		return;
	}

	// Sort tabs according to the view mode
	let sortedTabs = [...tabData];
	if (viewMode === 'date') {
		sortedTabs.sort((a, b) => new Date(b.date) - new Date(a.date));
	} else if (viewMode === 'title') {
		sortedTabs.sort((a, b) => a.title.localeCompare(b.title));
	} else if (viewMode === 'domain') {
		sortedTabs.sort((a, b) => {
			const domainA = extractDomain(a.url);
			const domainB = extractDomain(b.url);
			return domainA.localeCompare(domainB);
		});
	}

	// Group tabs by date if in date view mode
	if (viewMode === 'date') {
		const tabsByDate = groupTabsByDate(sortedTabs);

		for (const [dateStr, tabs] of Object.entries(tabsByDate)) {
			const dateHeader = document.createElement('h3');
			dateHeader.textContent = dateStr;
			dateHeader.className = 'date-header';
			tabsContainer.appendChild(dateHeader);

			const tabsForDate = document.createElement('div');
			tabsForDate.className = 'tabs-group';

			tabs.forEach(tab => {
				tabsForDate.appendChild(createTabElement(tab));
			});

			tabsContainer.appendChild(tabsForDate);
		}
	} else if (viewMode === 'domain') {
		// Group by domain
		const tabsByDomain = groupTabsByDomain(sortedTabs);

		for (const [domain, tabs] of Object.entries(tabsByDomain)) {
			const domainHeader = document.createElement('h3');
			domainHeader.textContent = domain;
			domainHeader.className = 'date-header domain-header'; // Reuse styles
			tabsContainer.appendChild(domainHeader);

			const tabsForDomain = document.createElement('div');
			tabsForDomain.className = 'tabs-group';

			tabs.forEach(tab => {
				tabsForDomain.appendChild(createTabElement(tab));
			});

			tabsContainer.appendChild(tabsForDomain);
		}
	} else {
		// Simple list for title view mode
		sortedTabs.forEach(tab => {
			tabsContainer.appendChild(createTabElement(tab));
		});
	}

	// Store the current view mode
	chrome.storage.local.set({ viewMode: viewMode });
}

function createTabElement(tab) {
	const tabElement = document.createElement('div');
	tabElement.className = 'tab-item';
	tabElement.dataset.id = tab.id;

	// Create favicon
	const favicon = document.createElement('img');
	favicon.className = 'tab-favicon';

	// Detect special URLs
	const isSpecialUrl = /^(chrome|edge|brave|about|file|view-source|devtools):/.test(tab.url);

	if (isSpecialUrl) {
		// Use static icons for special URLs instead of trying to load potentially inaccessible favicons
		if (tab.url.startsWith('chrome://')) {
			favicon.src = 'images/chrome-icon.png';
		} else if (tab.url.startsWith('edge://')) {
			favicon.src = 'images/edge-icon.png';
		} else if (tab.url.startsWith('brave://')) {
			favicon.src = 'images/brave-icon.png';
		} else if (tab.url.startsWith('about:')) {
			favicon.src = 'images/about-icon.png';
		} else if (tab.url.startsWith('file:')) {
			favicon.src = 'images/file-icon.png';
		} else {
			// For other special protocols
			favicon.src = 'images/default-favicon.png';
		}
	} else {
		// For regular URLs, use the favicon from the tab data
		if (tab.favicon && tab.favicon.trim() !== '') {
			favicon.src = tab.favicon;
		} else {
			favicon.src = 'images/default-favicon.png';
		}
	}

	// Add error handling only once
	favicon.onerror = function () {
		// If favicon loading fails, replace with default and remove the error handler
		// to prevent potential infinite loops
		this.src = 'images/default-favicon.png';
		this.onerror = null; // Prevent further error handling
	};

	// Create title and link
	const titleLink = document.createElement('a');
	titleLink.className = 'tab-link';
	titleLink.textContent = tab.title;
	titleLink.title = tab.url;

	if (isSpecialUrl) {
		// For special URLs, use a different approach
		titleLink.href = '#';
		titleLink.dataset.specialUrl = tab.url;
		titleLink.addEventListener('click', function (e) {
			e.preventDefault();

			// First open the special URL
			chrome.tabs.create({ url: tab.url }, function () {
				// Then delete this tab from the list
				deleteTab(tab.id);
			});
		});
	} else {
		// Regular URL - normal link handling
		titleLink.href = tab.url;
		titleLink.target = '_blank';

		// Add click handler to remove the item after clicking
		titleLink.addEventListener('click', function (e) {
			// Give the browser a moment to open the link before deleting
			setTimeout(function () {
				deleteTab(tab.id);
			}, 100);
		});
	}

	// Create time element
	const time = document.createElement('span');
	time.className = 'tab-time';

	const date = new Date(tab.date);
	time.textContent = formatTime(date);
	time.title = date.toLocaleString();

	// Create delete button
	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'tab-delete';
	deleteBtn.innerHTML = '&times;';
	deleteBtn.title = 'Delete this tab';
	deleteBtn.addEventListener('click', function (e) {
		e.stopPropagation();
		deleteTab(tab.id);
	});

	// Assemble tab element
	tabElement.appendChild(favicon);
	tabElement.appendChild(titleLink);
	tabElement.appendChild(time);
	tabElement.appendChild(deleteBtn);

	return tabElement;
}

function formatTime(date) {
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);

	const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

	const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

	if (isToday) {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	} else if (isYesterday) {
		return 'Yesterday';
	} else {
		return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}
}

function groupTabsByDate(tabs) {
	const groups = {};

	tabs.forEach(tab => {
		const date = new Date(tab.date);
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);

		let dateKey;

		if (isSameDay(date, now)) {
			dateKey = 'Today';
		} else if (isSameDay(date, yesterday)) {
			dateKey = 'Yesterday';
		} else {
			dateKey = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
		}

		if (!groups[dateKey]) {
			groups[dateKey] = [];
		}

		groups[dateKey].push(tab);
	});

	return groups;
}

function isSameDay(date1, date2) {
	return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear();
}

function deleteTab(tabId) {
	// No confirmation - directly delete the tab
	chrome.runtime.sendMessage({ action: 'deleteTab', tabId: tabId }, function (response) {
		if (response && response.success) {
			// Remove from UI
			const tabElement = document.querySelector(`.tab-item[data-id="${tabId}"]`);
			if (tabElement) {
				tabElement.remove();

				// Check if the group is now empty
				const group = tabElement.parentElement;
				if (group && group.className === 'tabs-group' && group.children.length === 0) {
					// Also remove the date header
					const header = group.previousElementSibling;
					if (header && header.className === 'date-header') {
						header.remove();
					}
					group.remove();
				}
			}

			// Check if all tabs are gone
			const tabsContainer = document.getElementById('tabsContainer');
			if (tabsContainer.children.length === 0) {
				tabsContainer.innerHTML = '<p class="empty-message">No saved tabs yet. Save some tabs from the extension popup.</p>';
			}
		}
	});
}

function sortTabs(mode) {
	chrome.storage.local.get(['tabData'], function (result) {
		const tabData = result.tabData || [];
		displayTabs(tabData, mode);
	});
}

function filterTabs(searchTerm) {
	const tabItems = document.querySelectorAll('.tab-item');
	const dateHeaders = document.querySelectorAll('.date-header');
	const groups = document.querySelectorAll('.tabs-group');

	// Reset visibility
	dateHeaders.forEach(header => (header.style.display = 'block'));
	groups.forEach(group => (group.style.display = 'block'));

	if (searchTerm === '') {
		tabItems.forEach(item => (item.style.display = 'flex'));
		return;
	}

	// Track which date sections have visible tabs
	const visibleGroups = new Set();

	tabItems.forEach(item => {
		const title = item.querySelector('.tab-link').textContent.toLowerCase();
		const url = item.querySelector('.tab-link').href.toLowerCase();

		if (title.includes(searchTerm) || url.includes(searchTerm)) {
			item.style.display = 'flex';
			// Find parent group
			const group = item.closest('.tabs-group');
			if (group) {
				visibleGroups.add(group);
			}
		} else {
			item.style.display = 'none';
		}
	});

	// Hide empty date sections
	groups.forEach(group => {
		if (!visibleGroups.has(group)) {
			group.style.display = 'none';
			// Also hide the corresponding header
			const header = group.previousElementSibling;
			if (header && header.className === 'date-header') {
				header.style.display = 'none';
			}
		}
	});
}

// Storage management functions
function createNewStorageFile() {
	console.log('Creating new blank storage file');

	try {
		// Create empty tab data array
		const emptyTabData = [];

		// Create a JSON blob for the empty data
		const jsonData = JSON.stringify(emptyTabData, null, 2);
		const blob = new Blob([jsonData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		// Generate a filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `saved_tabs_${timestamp}.json`;

		// Create a download link for the empty file
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();

		setTimeout(function () {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);

			// Clear the current storage and switch to the new empty file
			chrome.storage.local.set(
				{
					tabData: emptyTabData,
					storageFilePath: filename
				},
				function () {
					console.log('Switched to new empty storage:', filename);
					updateStoragePathDisplay();
					loadTabs(); // Reload the tab display to show empty state

					// Show confirmation to user
					// alert(`Created new empty storage file: ${filename}\nYour previous tabs have been cleared.`);
				}
			);
		}, 100);
	} catch (e) {
		console.error('Error creating storage file:', e);
		alert('Error creating storage file: ' + e.message);
	}
}

function loadStorageFile(event) {
	console.log('Loading storage file');

	const file = event.target.files[0];
	if (!file) {
		console.log('No file selected');
		return;
	}

	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			const data = JSON.parse(e.target.result);

			// Save to storage
			chrome.storage.local.set(
				{
					tabData: data,
					storageFilePath: file.name
				},
				function () {
					console.log('Storage updated with file data');
					updateStoragePathDisplay();
					loadTabs(); // Reload the tab display

					// Reset the file input to allow loading the same file again
					event.target.value = '';
				}
			);
		} catch (error) {
			console.error('Error parsing JSON:', error);
			alert('Invalid JSON file: ' + error.message);
		}
	};

	reader.onerror = function () {
		console.error('Error reading file');
		alert('Error reading file');
	};

	reader.readAsText(file);
}

function exportStorage() {
	console.log('Exporting current storage');

	chrome.storage.local.get(['tabData'], function (result) {
		const tabData = result.tabData || [];

		// Create a JSON blob
		const jsonData = JSON.stringify(tabData, null, 2);
		const blob = new Blob([jsonData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		// Generate a filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `tab_saver_export_${timestamp}.json`;

		// Create a download link
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();

		// Clean up
		setTimeout(function () {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 100);
	});
}

function updateStoragePathDisplay() {
	chrome.storage.local.get(['storageFilePath'], result => {
		const storagePathElement = document.getElementById('currentStoragePath');
		if (storagePathElement) {
			if (result.storageFilePath) {
				storagePathElement.textContent = `Current storage: ${result.storageFilePath}`;
			} else {
				storagePathElement.textContent = 'Current storage: Local browser storage';
			}
		}
	});
}

// Extract domain from URL - updated to strip www.
function extractDomain(url) {
	try {
		const urlObj = new URL(url);
		let hostname = urlObj.hostname;

		// Remove www. prefix if present
		if (hostname.startsWith('www.')) {
			hostname = hostname.substring(4);
		}

		return hostname;
	} catch (e) {
		console.error('Invalid URL:', url, e);
		return url; // Return the original URL if parsing fails
	}
}

// Group tabs by domain
function groupTabsByDomain(tabs) {
	const groups = {};

	tabs.forEach(tab => {
		const domain = extractDomain(tab.url);

		if (!groups[domain]) {
			groups[domain] = [];
		}

		groups[domain].push(tab);
	});

	return groups;
}
