const Bible = {
    data: {
        view: 'books',
        selectedBook: null,
        selectedChapter: null,
        fontSize: parseInt(localStorage.getItem('bibleFontSize')) || 10,
        darkMode: false,
        bookmarks: JSON.parse(localStorage.getItem('bibleBookmarks')) || [],
        chapterBookmarks: JSON.parse(localStorage.getItem('bibleChapterBookmarks')) || [],
        notes: JSON.parse(localStorage.getItem('bibleNotes')) || [],
        searchResults: [], // Deprecated in favor of searchState but kept for compatibility
        searchState: { matches: [], renderedCount: 0, query: '' },
        loading: true,
        lastRead: JSON.parse(localStorage.getItem('bibleLastRead')) || null,
        daily: JSON.parse(localStorage.getItem('bibleDailyUser')) || {
            goal: { amount: 1, type: 'chapters' }, // chapters or minutes
            plan: 'none', // none, 30, 90, 365, chronological, random
            reminder: { time: null, sound: true },
            progress: { date: new Date().toDateString(), count: 0, chaptersRead: [] }
        },
        readingHistory: JSON.parse(localStorage.getItem('bibleReadingHistory')) || [],
        settings: JSON.parse(localStorage.getItem('bibleSettings')) || {
            disablePressHold: false,

            hideVerseButtons: false,
            centerView: false,
            disableSquareNav: false,
        },
        raw: null,
        enRaw: null,
        visibleEnglish: new Set()
    },

    // Metadata for Malayalam Book Names (since data.json structure is indexed)
    bookMetadata: [
        // Old Testament (39)
        "ഉല്പത്തി", "പുറപ്പാട്", "ലേവ്യപുസ്തകം", "സംഖ്യാപുസ്തകം", "ആവർത്തനപുസ്തകം", "യോശുവ", "ന്യായാധിപന്മാർ", "രൂത്ത്", "1 ശമൂവേൽ", "2 ശമൂവേൽ",
        "1 രാജാക്കന്മാർ", "2 രാജാക്കന്മാർ", "1 ദിനവൃത്താന്തം", "2 ദിനവൃത്താന്തം", "എസ്രാ", "നെഹെമ്യാവ്", "എസ്ഥേർ", "ഇയ്യോബ്", "സങ്കീർത്തനങ്ങൾ", "സദൃശവാക്യങ്ങൾ",
        "സഭാപ്രസംഗി", "ഉത്തമഗീതം", "യെശയ്യാവ്", "യിരെമ്യാവ്", "വിലാപങ്ങൾ", "യെഹെസ്കേൽ", "ദാനീയേൽ", "ഹോശേയ", "യോവേൽ", "ആമോസ്",
        "ഓബദ്യാവ്", "യോനാ", "മീഖാ", "നഹൂം", "ഹബക്കൂക്", "സെഫന്യാവ്", "ഹഗ്ഗായി", "സെഖര്യാവ്", "മലാഖി",
        // New Testament (27)
        "മത്തായി", "മർക്കൊസ്", "ലൂക്കോസ്", "യോഹന്നാൻ", "പ്രവൃത്തികൾ", "റോമർ", "1 കൊരിന്ത്യർ", "2 കൊരിന്ത്യർ", "ഗലാത്യർ", "എഫെസ്യർ",
        "ഫിലിപ്പിയർ", "കൊലൊസ്സ്യർ", "1 തെസ്സലൊനീക്യർ", "2 തെസ്സലൊനീക്യർ", "1 തിമൊഥെയൊസ്", "2 തിമൊഥെയൊസ്", "തീത്തൊസ്", "ഫിലോമോൻ", "എബ്രായർ", "യാക്കോബ്",
        "1 പത്രൊസ്", "2 പത്രൊസ്", "1 യോഹന്നാൻ", "2 യോഹന്നാൻ", "3 യോഹന്നാൻ", "യൂദാ", "വെളിപ്പാട്"
    ],

    books: {
        old: [],
        new: []
    },

    async init() {
        this.initializeBooksStructure();
        this.renderBooks();
        this.attachEvents();
        await this.loadData();

        // Auto-Continue
        if (this.data.lastRead) {
            // Restore last read session immediately
            // We need to wait for data to be processed slightly, but we await loadData so we are good.
            this.data.selectedBook = {
                id: this.data.lastRead.bookId,
                name: this.data.lastRead.bookName,
                chapters: this.data.lastRead.chaptersCount
            };
            this.data.selectedChapter = this.data.lastRead.chapter;
            this.renderVerses();
            this.showView('verses');
        }

        // Initialize Daily Progress Check
        this.checkDailyProgressReset();
        this.startReminderCheck();

        // Restore dark mode preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        if (savedDarkMode) {
            this.data.darkMode = true;
            document.body.classList.add('dark-mode');
            const toggleBtn = document.getElementById('toggleDark');
            if (toggleBtn) toggleBtn.classList.add('active');
        }

        // Restore settings
        this.applySettings();
        this.initializeSettingsToggles();
    },

    initializeBooksStructure() {
        // Populate books.old and books.new based on metadata
        this.bookMetadata.forEach((name, index) => {
            const book = { id: index + 1, name: name, chapters: 0 }; // chapters will be updated after load
            if (index < 39) {
                this.books.old.push(book);
            } else {
                this.books.new.push(book);
            }
        });
    },

    async loadData() {
        try {
            // Show loading state if meaningful
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loadingIndicator';
            loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.1);border-radius:8px;z-index:1000;';
            loadingDiv.textContent = 'Loading Bible Data...';
            document.body.appendChild(loadingDiv);

            const response = await fetch('data.json');
            if (!response.ok) throw new Error('Failed to load data.json');

            const jsonData = await response.json();
            this.data.raw = jsonData;

            // Load English data
            try {
                const enResponse = await fetch('dataen.json');
                if (enResponse.ok) {
                    this.data.enRaw = await enResponse.json();
                }
            } catch (enErr) {
                console.warn('Could not load dataen.json', enErr);
            }

            this.data.loading = false;

            // Update chapter counts
            if (this.data.raw && this.data.raw.Book) {
                this.data.raw.Book.forEach((bookData, index) => {
                    // Clean trailing quotes from verses
                    if (bookData.Chapter) {
                        bookData.Chapter.forEach(c => {
                            if (c.Verse) {
                                c.Verse.forEach(v => {
                                    if (v.Verse && typeof v.Verse === 'string') {
                                        v.Verse = v.Verse.replace(/["”]+$/, '');
                                    }
                                });
                            }
                        });
                    }

                    // Clean enRaw as well
                    if (this.data.enRaw && this.data.enRaw.Book && this.data.enRaw.Book[index]) {
                        const enBook = this.data.enRaw.Book[index];
                        if (enBook.Chapter) {
                            enBook.Chapter.forEach(c => {
                                if (c.Verse) {
                                    c.Verse.forEach(v => {
                                        if (v.Verse && typeof v.Verse === 'string') {
                                            v.Verse = v.Verse.replace(/["”]+$/, '');
                                        }
                                    });
                                }
                            });
                        }
                    }

                    const chapterCount = bookData.Chapter ? bookData.Chapter.length : 0;
                    // Find the corresponding book in our metadata structures
                    if (index < 39) {
                        if (this.books.old[index]) this.books.old[index].chapters = chapterCount;
                    } else {
                        const newIndex = index - 39;
                        if (this.books.new[newIndex]) this.books.new[newIndex].chapters = chapterCount;
                    }
                });
            }

            // Remove loading indicator
            document.body.removeChild(loadingDiv);

            // Re-render books to update any attributes if needed
            this.renderBooks();

        } catch (error) {
            console.error('Error loading Bible data:', error);
            const loadingDiv = document.getElementById('loadingIndicator');
            if (loadingDiv) {
                loadingDiv.textContent = 'Error loading data.json. Please ensure you are running a local server or allowed file access.';
                loadingDiv.style.color = 'red';
            }
        }
    },

    renderBooks() {
        const renderBook = (book) => `
            <button class="book-btn" data-id="${book.id}" data-name="${book.name}" data-chapters="${book.chapters}">
                ${book.name}
            </button>
        `;

        document.getElementById('oldTestament').innerHTML = this.books.old.map(renderBook).join('');
        document.getElementById('newTestament').innerHTML = this.books.new.map(renderBook).join('');

        // Reset header title
        const title = document.getElementById('headerTitle');
        if (title) title.textContent = 'സത്യവേദപുസ്തകം';

        // Auto-fit text
        this.fitBookButtons();
    },

    fitBookButtons() {
        // Use requestAnimationFrame to ensure DOM is ready for measurement
        requestAnimationFrame(() => {
            document.querySelectorAll('.book-btn').forEach(btn => {
                let size = 12;
                btn.style.fontSize = size + 'px';

                // Reduce size while content overflows
                // checking scrollHeight against clientHeight
                while (btn.scrollHeight > btn.clientHeight && size > 8) {
                    size--;
                    btn.style.fontSize = size + 'px';
                }
            });
        });
    },

    renderChapters() {
        const book = this.data.selectedBook;
        // Double check chapter count from loaded data if available
        let chapterCount = book.chapters;
        if (this.data.raw && this.data.raw.Book) {
            const bookIndex = book.id - 1;
            if (this.data.raw.Book[bookIndex] && this.data.raw.Book[bookIndex].Chapter) {
                chapterCount = this.data.raw.Book[bookIndex].Chapter.length;
            }
        }

        let html = '';
        for (let i = 1; i <= chapterCount; i++) {
            const chapterKey = `${book.id}-${i}`;
            const isRead = this.data.daily.progress.chaptersRead.includes(chapterKey);
            const statusClass = isRead ? 'read' : '';
            html += `<button class="chapter-btn ${statusClass}" data-chapter="${i}">${i}</button>`;
        }
        document.getElementById('chaptersGrid').innerHTML = html;

        const title = document.getElementById('headerTitle');
        title.textContent = `${book.name} - അദ്ധ്യായം തിരഞ്ഞെടുക്കുക`;
    },

    renderVerses() {
        const bookId = this.data.selectedBook.id;
        const chapterNum = this.data.selectedChapter;

        let verses = [];

        if (this.data.raw && this.data.raw.Book) {
            const bookIndex = bookId - 1;
            const chapterIndex = chapterNum - 1;
            const bookData = this.data.raw.Book[bookIndex];
            if (bookData && bookData.Chapter && bookData.Chapter[chapterIndex]) {
                // The structure in data.json seems to be { Verse: [ {Verseid, Verse}, ... ] }
                // Based on the file view, bookData.Chapter[chapterIndex] is an object with a "Verse" property
                verses = bookData.Chapter[chapterIndex].Verse || [];
            }
        }

        // Fallback or empty state
        if (verses.length === 0 && !this.data.loading) {
            document.getElementById('versesList').innerHTML = '<div class="empty-state">No verses found.</div>';
            return;
        }

        let html = '';
        verses.forEach((verseObj, index) => {
            const verseNum = index + 1;
            let verseText = verseObj.Verse;

            // Highlight search term
            if (this.data.highlight &&
                this.data.highlight.verse === verseNum &&
                this.data.highlight.query) {
                const query = this.data.highlight.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex
                const regex = new RegExp(`(${query})`, 'gi');
                verseText = verseText.replace(regex, '<span class="highlight-word">$1</span>');
            }

            const isBookmarked = this.data.bookmarks.some(b =>
                b.book === this.data.selectedBook.name &&
                b.chapter === this.data.selectedChapter &&
                b.verse === verseNum
            );

            const verseKey = `${this.data.selectedBook.id}-${this.data.selectedChapter}-${verseNum}`;
            const showEnglish = this.data.visibleEnglish.has(verseKey);
            let englishText = '';

            if (showEnglish && this.data.enRaw && this.data.enRaw.Book) {
                const bIdx = this.data.selectedBook.id - 1;
                const cIdx = this.data.selectedChapter - 1;
                if (this.data.enRaw.Book[bIdx] &&
                    this.data.enRaw.Book[bIdx].Chapter[cIdx] &&
                    this.data.enRaw.Book[bIdx].Chapter[cIdx].Verse[index]) {
                    englishText = this.data.enRaw.Book[bIdx].Chapter[cIdx].Verse[index].Verse;
                    englishText = englishText.replace(/["”]+$/, '');
                }
            }

            // EN Button
            const enButton = `
                <button class="action-btn en-btn ${showEnglish ? 'active' : ''}" data-verse="${verseNum}" title="${showEnglish ? 'Hide English' : 'Show English'}">
                    EN
                </button>
            `;

            // Bookmark button
            const bookmarkButton = `
                <button class="action-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-verse="${verseNum}" title="${isBookmarked ? 'Remove Bookmark' : 'Save Verse'}">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
            `;

            // Copy button
            const copyButton = `
                <button class="action-btn copy-btn" data-verse="${verseNum}" title="Copy Verse">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
            `;

            // Share button
            const shareButton = `
                <button class="action-btn share-btn" data-verse="${verseNum}" title="Share Verse">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                </button>
            `;

            html += `
                <div class="verse-item ${isBookmarked ? 'bookmarked' : ''}" data-verse="${verseNum}">
                    <div class="verse-meta">
                        <span class="verse-number">${verseNum}</span>
                    </div>
                    <div class="verse-body">
                        <span class="verse-content">${verseText}</span>
                        ${showEnglish && englishText ? `<span class="english-verse-content">${englishText}</span>` : ''}
                        ${!this.data.settings.hideVerseButtons ? `
                        <div class="verse-actions">
                            ${enButton}
                            ${copyButton}
                            ${shareButton}
                            ${bookmarkButton}
                        </div>` : ''}
                    </div>
                </div>
            `;
        });
        document.getElementById('versesList').innerHTML = html;

        const title = document.getElementById('headerTitle');
        title.textContent = `${this.data.selectedBook.name} - ${this.data.selectedChapter}`;

        // Update chapter bookmark button state
        this.updateChapterBookmarkBtn();

        // Update Last Read
        this.data.lastRead = {
            bookId: this.data.selectedBook.id,
            bookName: this.data.selectedBook.name,
            chapter: this.data.selectedChapter,
            chaptersCount: this.data.selectedBook.chapters
        };
        localStorage.setItem('bibleLastRead', JSON.stringify(this.data.lastRead));

        // Track Daily Progress
        this.trackDailyProgress();

        // Setup press and hold functionality unless disabled
        if (!this.data.settings.disablePressHold) {
            this.setupPressAndHold();
        }

    },

    appendSearchBatch() {
        const state = this.data.searchState;
        const BATCH_SIZE = 10;

        if (state.renderedCount >= state.matches.length) return;

        const start = state.renderedCount;
        const end = Math.min(start + BATCH_SIZE, state.matches.length);
        const batch = state.matches.slice(start, end);
        const container = document.getElementById('searchResults');

        let html = '';
        batch.forEach(m => {
            html += `
                <button class="search-result" data-bookid="${m.bookId}" data-chapter="${m.chNum}" data-verse="${m.vNum}" data-query="${state.query}">
                    <div class="search-result-book">${m.bookName} ${m.chNum}:${m.vNum}</div>
                    <div class="search-result-text">${m.text.substring(0, 85)}...</div>
                    ${m.engText ? `<div class="search-result-eng" style="font-size: 11px; opacity: 0.7; font-style: italic; margin-top: 4px;">${m.engText.substring(0, 75)}...</div>` : ''}
                </button>
            `;
        });

        // If this is the starting batch
        if (start === 0) {
            if (state.matches.length === 0) {
                container.innerHTML = '<div class="empty-state">No matching verses found.</div>';
                return;
            }
            container.innerHTML = `<div style="padding: 8px 16px; color: var(--accent-color); font-size: 13px; font-weight: 600;">Found ${state.matches.length} matches</div>` + html;
        } else {
            // Append to existing
            container.insertAdjacentHTML('beforeend', html);
        }

        state.renderedCount = end;

        // Add "End of results" indication if finished
        if (state.renderedCount >= state.matches.length && state.matches.length > 0) {
            const endMsg = document.createElement('div');
            endMsg.className = 'empty-state';
            endMsg.style.padding = '10px';
            endMsg.style.fontSize = '12px';
            endMsg.textContent = 'End of results';
            container.appendChild(endMsg);
        }
    },

    showView(view) {
        document.getElementById('booksView').classList.toggle('hidden', view !== 'books');
        document.getElementById('chaptersView').classList.toggle('hidden', view !== 'chapters');
        document.getElementById('versesView').classList.toggle('hidden', view !== 'verses');

        // Header visibility logic
        const headerNav = document.getElementById('headerNav');

        if (view === 'verses' || view === 'chapters') {
            headerNav.classList.remove('hidden');
        } else {
            headerNav.classList.add('hidden');
        }

        this.data.view = view; if (view !== 'verses') { const floatBtn = document.getElementById('floatingNextBtn'); if (floatBtn) floatBtn.classList.remove('visible'); }
    },

    showModal(modalId) {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
        if (modalId) {
            document.getElementById(modalId).classList.add('show');
            document.getElementById('modalOverlay').classList.add('show');
        }
        // Hide floating button to prevent overlap
        const floatBtn = document.getElementById('floatingNextBtn');
        if (floatBtn) floatBtn.classList.remove('visible');
    },

    hideModal() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
        document.getElementById('modalOverlay').classList.remove('show');

        // Trigger scroll event to restore floating buttons if needed
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.dispatchEvent(new Event('scroll'));
        }
    },

    renderNotes() {
        const notesHtml = this.data.notes.length > 0
            ? [...this.data.notes].reverse().map((note, i) => {
                const originalIndex = this.data.notes.length - 1 - i;
                return `
                <div class="note-item">
                    <div class="note-content">
                        <p class="note-text">${note.text}</p>
                        <p class="note-date">${note.date} • ${note.time}</p>
                    </div>
                    <button class="delete-note-btn" data-index="${originalIndex}" title="Delete Note">✕</button>
                </div>
            `}).join('')
            : '<div class="empty-state">No notes yet. Add a note below!</div>';


        document.getElementById('notesList').innerHTML = notesHtml;
    },

    renderBookmarks() {
        // Chapter bookmarks
        const chapterBookmarksHtml = this.data.chapterBookmarks.length > 0
            ? [...this.data.chapterBookmarks].reverse().map((cb, i) => {
                const originalIndex = this.data.chapterBookmarks.length - 1 - i;
                return `
                <div class="bookmark-item chapter-bookmark-item">
                    <div class="bookmark-content chapter-bookmark-content" data-chbindex="${originalIndex}">
                        <p class="bookmark-ref">${cb.book} - ${cb.chapter} അദ്ധ്യായം</p>
                        <p class="bookmark-text" style="font-size:12px;opacity:0.7;">Saved on ${cb.date}</p>
                    </div>
                    <button class="delete-bookmark-btn" data-chbindex="${originalIndex}" title="Delete">✕</button>
                </div>
            `;}).join('')
            : '<div class="empty-state">No saved chapters yet.</div>';

        document.getElementById('chapterBookmarksList').innerHTML = chapterBookmarksHtml;

        // Verse bookmarks
        const bookmarksHtml = this.data.bookmarks.length > 0
            ? [...this.data.bookmarks].reverse().map((b, i) => {
                const originalIndex = this.data.bookmarks.length - 1 - i;
                return `
                <div class="bookmark-item">
                    <div class="bookmark-content" data-index="${originalIndex}">
                        <p class="bookmark-ref">${b.book} ${b.chapter}:${b.verse}</p>
                        <p class="bookmark-text">${b.text}</p>
                    </div>
                    <button class="delete-bookmark-btn" data-index="${originalIndex}" title="Delete Bookmark">✕</button>
                </div>
            `}).join('')
            : '<div class="empty-state">No bookmarks yet. Save verses to bookmark them!</div>';

        document.getElementById('bookmarksList').innerHTML = bookmarksHtml;
    },

    toggleChapterBookmark() {
        if (!this.data.selectedBook || !this.data.selectedChapter) return;
        const book = this.data.selectedBook.name;
        const chapter = this.data.selectedChapter;
        const existingIndex = this.data.chapterBookmarks.findIndex(
            cb => cb.book === book && cb.chapter === chapter
        );
        if (existingIndex > -1) {
            this.data.chapterBookmarks.splice(existingIndex, 1);
        } else {
            this.data.chapterBookmarks.push({
                book,
                chapter,
                bookId: this.data.selectedBook.id,
                chaptersCount: this.data.selectedBook.chapters,
                date: new Date().toLocaleDateString()
            });
        }
        localStorage.setItem('bibleChapterBookmarks', JSON.stringify(this.data.chapterBookmarks));
        this.updateChapterBookmarkBtn();
    },

    updateChapterBookmarkBtn() {
        const btn = document.getElementById('bookmarkChapterBtn');
        if (!btn) return;
        const isBookmarked = this.data.chapterBookmarks.some(
            cb => cb.book === this.data.selectedBook.name && cb.chapter === this.data.selectedChapter
        );
        const svg = btn.querySelector('svg');
        if (isBookmarked) {
            btn.classList.add('chapter-bookmarked');
            if (svg) svg.setAttribute('fill', 'currentColor');
            btn.title = 'Remove Chapter Bookmark';
        } else {
            btn.classList.remove('chapter-bookmarked');
            if (svg) svg.setAttribute('fill', 'none');
            btn.title = 'Bookmark this Chapter';
        }
    },

    checkDailyProgressReset() {
        const today = new Date().toDateString();
        if (this.data.daily.progress.date !== today) {
            this.data.daily.progress = { date: today, count: 0, chaptersRead: [] };
            this.saveDailySettings();
        }
        this.updateDailyUI();
    },

    trackDailyProgress() {
        const today = new Date().toDateString();
        if (this.data.daily.progress.date !== today) {
            this.checkDailyProgressReset();
        }

        // Create unique implementation for chapter string: "BookIndex-ChapterIndex"
        const chapterKey = `${this.data.selectedBook.id}-${this.data.selectedChapter}`;

        if (!this.data.daily.progress.chaptersRead.includes(chapterKey)) {
            this.data.daily.progress.chaptersRead.push(chapterKey);
            this.data.daily.progress.count++;

            // Add to reading history
            const historyEntry = {
                date: new Date().toISOString(),
                dateString: today,
                bookId: this.data.selectedBook.id,
                bookName: this.data.selectedBook.name,
                chapter: this.data.selectedChapter,
                chapterKey: chapterKey
            };
            this.data.readingHistory.push(historyEntry);
            localStorage.setItem('bibleReadingHistory', JSON.stringify(this.data.readingHistory));

            this.saveDailySettings();
            this.updateDailyUI();
        }
    },

    saveDailySettings() {
        localStorage.setItem('bibleDailyUser', JSON.stringify(this.data.daily));
        this.updateDailyUI();
    },

    resetProgress() {
        if (confirm('Are you sure you want to reset all reading progress? This cannot be undone.')) {
            this.data.daily.progress = {
                date: new Date().toDateString(),
                count: 0,
                chaptersRead: []
            };
            this.saveDailySettings();
            this.data.readingHistory = [];
            localStorage.setItem('bibleReadingHistory', JSON.stringify([]));
            this.updateDailyUI();
            this.renderReadingHistory();
        }
    },

    updateDailyUI() {
        const TOTAL_CHAPTERS = 1189; // Total chapters in the Bible
        const chaptersRead = this.data.daily.progress.count;
        const chaptersRemaining = TOTAL_CHAPTERS - chaptersRead;
        const percent = Math.min(100, Math.round((chaptersRead / TOTAL_CHAPTERS) * 100));

        // Update Progress Circle
        const percentText = document.getElementById('progressPercent');
        const ring = document.querySelector('.progress-ring__value');

        if (percentText) percentText.textContent = `${percent}%`;

        if (ring) {
            const radius = ring.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            ring.style.strokeDasharray = `${circumference} ${circumference}`;
            const offset = circumference - (percent / 100) * circumference;
            ring.style.strokeDashoffset = offset;
        }

        // Update Stats
        const chaptersReadEl = document.getElementById('chaptersRead');
        const chaptersRemainingEl = document.getElementById('chaptersRemaining');

        if (chaptersReadEl) chaptersReadEl.textContent = chaptersRead;
        if (chaptersRemainingEl) chaptersRemainingEl.textContent = chaptersRemaining;

        // Update Last Read Button
        const lastReadTitle = document.getElementById('lastReadTitle');
        const lastReadSubtitle = document.getElementById('lastReadSubtitle');

        if (this.data.lastRead && lastReadTitle && lastReadSubtitle) {
            lastReadTitle.textContent = this.data.lastRead.bookName;
            lastReadSubtitle.textContent = `Chapter ${this.data.lastRead.chapter}`;
        } else if (lastReadTitle && lastReadSubtitle) {
            lastReadTitle.textContent = 'Start Reading';
            lastReadSubtitle.textContent = 'Begin your journey';
        }
    },

    renderReadingHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        if (this.data.readingHistory.length === 0) {
            historyList.innerHTML = '<div class="empty-state">No reading history yet. Start reading to track your progress!</div>';
            return;
        }

        // Group by date
        const groupedByDate = {};
        this.data.readingHistory.forEach(entry => {
            if (!groupedByDate[entry.dateString]) {
                groupedByDate[entry.dateString] = [];
            }
            groupedByDate[entry.dateString].push(entry);
        });

        // Sort dates (most recent first)
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

        let html = '';
        sortedDates.forEach(dateString => {
            const entries = groupedByDate[dateString];
            const date = new Date(dateString);
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            html += `
                <div class="history-date-group">
                    <div class="history-date-header">
                        <span class="history-date">${formattedDate}</span>
                        <span class="history-count">${entries.length} chapter${entries.length > 1 ? 's' : ''}</span>
                    </div>
                    <div class="history-chapters">
                        ${entries.map(entry => `
                            <div class="history-chapter-item">
                                <span class="history-book">${entry.bookName}</span>
                                <span class="history-chapter-num">Ch. ${entry.chapter}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        historyList.innerHTML = html;
    },

    startReminderCheck() {
        // Simple One-minute check interval
        setInterval(() => {
            const reminderTime = this.data.daily.reminder.time;
            if (!reminderTime) return;

            const now = new Date();
            const currentHours = now.getHours().toString().padStart(2, '0');
            const currentMinutes = now.getMinutes().toString().padStart(2, '0');
            const currentTime = `${currentHours}:${currentMinutes}`;

            // Check if we just hit the minute (avoid multiple triggers by creating a 'lastTriggered' flag in session if needed, 
            // but for simplicity let's just show an alert if focused or assume OS notification if possible)
            // Since this is a simple web app, we'll try Notification API

            if (currentTime === reminderTime && now.getSeconds() < 2) {
                this.triggerNotification();
            }
        }, 1000);
    },

    triggerNotification() {
        if (this.data.daily.reminder.sound) {
            // Play a soft beep
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869.wav'); // Placeholder generic sound or none
            // We won't fetch external assets to avoid CORS/Errors without user consent, skipping audio for safety unless embedded.
            // Using browser beep is not standard. We'll skip actual Audio element unless we have a local file.
            // Let's console log for now or try a system notification.
        }

        if (Notification.permission === 'granted') {
            new Notification('📖 Time to Read', {
                body: `Daily Goal: Read ${this.data.daily.goal.amount} chapters!`,
                icon: '' // Optional icon
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.triggerNotification();
                }
            });
        }
    },

    goToRandomChapter() {
        // Pick random book
        const isOld = Math.random() < 0.7; // Weighted slightly? No, true random
        const totalBooks = 66;
        const randomBookIndex = Math.floor(Math.random() * totalBooks);

        let book;
        if (randomBookIndex < 39) {
            book = this.books.old[randomBookIndex];
        } else {
            book = this.books.new[randomBookIndex - 39];
        }

        // Pick random chapter
        const randomChapter = Math.floor(Math.random() * book.chapters) + 1;

        this.data.selectedBook = book;
        this.data.selectedChapter = randomChapter;
        this.renderVerses();
        this.showView('verses');
        this.hideModal();
    },

    setupPressAndHold() {
        const verseItems = document.querySelectorAll('.verse-item');
        let pressTimer;

        verseItems.forEach(item => {
            const verseNum = parseInt(item.dataset.verse);

            const startPress = (e) => {
                // Don't trigger if clicking child buttons
                if (e.target.closest('.bookmark-btn') || e.target.closest('.action-btn')) return;

                pressTimer = setTimeout(() => {
                    this.toggleBookmark(verseNum);

                    // Visual feedback
                    item.classList.add('press-hold-active');
                    setTimeout(() => item.classList.remove('press-hold-active'), 300);

                    // Haptic feedback
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 500); // 500ms hold
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            // Touch events
            item.addEventListener('touchstart', startPress, { passive: true });
            item.addEventListener('touchend', cancelPress);
            item.addEventListener('touchmove', cancelPress);

            // Mouse events
            item.addEventListener('mousedown', startPress);
            item.addEventListener('mouseup', cancelPress);
            item.addEventListener('mouseleave', cancelPress);

            // Prevent native context menu (clipboard/select) on long press
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // Ensure timer is cleared if context menu tries to fire
                cancelPress();
            });
        });
    },

    toggleBookmark(verseNum) {
        if (!this.data.raw) return;

        // Retrieve text for bookmark
        let verseText = 'Verse text';
        if (this.data.raw && this.data.raw.Book) {
            const bIdx = this.data.selectedBook.id - 1;
            const cIdx = this.data.selectedChapter - 1;
            if (this.data.raw.Book[bIdx] &&
                this.data.raw.Book[bIdx].Chapter[cIdx] &&
                this.data.raw.Book[bIdx].Chapter[cIdx].Verse[verseNum - 1]) {
                verseText = this.data.raw.Book[bIdx].Chapter[cIdx].Verse[verseNum - 1].Verse;
            }
        }

        const existingIndex = this.data.bookmarks.findIndex(b =>
            b.book === this.data.selectedBook.name &&
            b.chapter === this.data.selectedChapter &&
            b.verse === verseNum
        );

        if (existingIndex > -1) {
            this.data.bookmarks.splice(existingIndex, 1);
        } else {
            this.data.bookmarks.push({
                book: this.data.selectedBook.name,
                chapter: this.data.selectedChapter,
                verse: verseNum,
                text: verseText
            });
        }
        this.saveUserContent();
        this.renderVerses();
    },

    saveUserContent() {
        localStorage.setItem('bibleBookmarks', JSON.stringify(this.data.bookmarks));
        localStorage.setItem('bibleNotes', JSON.stringify(this.data.notes));
    },

    attachEvents() {
        // ... (keep existing calls)

        // Random Btn
        const randomBtn = document.getElementById('randomVerseBtn');
        if (randomBtn) randomBtn.addEventListener('click', () => this.goToRandomChapter());

        // Last Read Button
        const lastReadBtn = document.getElementById('lastReadBtn');
        if (lastReadBtn) {
            lastReadBtn.addEventListener('click', () => {
                if (this.data.lastRead) {
                    // Navigate to last read chapter
                    this.data.selectedBook = {
                        id: this.data.lastRead.bookId,
                        name: this.data.lastRead.bookName,
                        chapters: this.data.lastRead.chaptersCount
                    };
                    this.data.selectedChapter = this.data.lastRead.chapter;
                    this.renderVerses();
                    this.showView('verses');
                } else {
                    // Start from Genesis 1
                    this.data.selectedBook = this.books.old[0];
                    this.data.selectedChapter = 1;
                    this.renderVerses();
                    this.showView('verses');
                }
                this.hideModal();
            });
        }

        // Reset Progress Button
        const resetProgressBtn = document.getElementById('resetProgressBtn');
        if (resetProgressBtn) {
            resetProgressBtn.addEventListener('click', () => {
                this.resetProgress();
            });
        }

        // Floating Next Button Logic
        const mainContent = document.getElementById('mainContent');
        const floatBtn = document.getElementById('floatingNextBtn');
        let scrollTimer = null;

        if (mainContent) {
            // Scroll Indicator & End Overlay Logic
            const scrollIndicator = document.getElementById('scrollIndicator');
            const endOverlay = document.getElementById('endPageOverlay');
            const startOverlay = document.getElementById('startPageOverlay');

            // Initial Scroll Indicator Visibility
            if (scrollIndicator) {
                if (this.data.view === 'books') scrollIndicator.classList.remove('hidden');
                else scrollIndicator.classList.add('hidden');
            }


            mainContent.addEventListener('scroll', () => {
                // 0. Scroll Indicator Logic (Home Screen Only)
                if (scrollIndicator) {
                    if (this.data.view === 'books' && mainContent.scrollTop < 20) {
                        scrollIndicator.classList.remove('hidden');
                    } else {
                        scrollIndicator.classList.add('hidden');
                    }
                }

                // 1. Floating Next Button Logic
                const isAtBottom = mainContent.scrollHeight - mainContent.scrollTop - mainContent.clientHeight < 50;

                if (this.data.view === 'verses' && isAtBottom && floatBtn) {
                    if (!floatBtn.classList.contains('visible') && !scrollTimer) {
                        scrollTimer = setTimeout(() => {
                            if (floatBtn) floatBtn.classList.add('visible');
                            scrollTimer = null;
                        }, 1000);
                    }
                    if (endOverlay) endOverlay.classList.add('visible');
                } else {
                    if (scrollTimer) {
                        clearTimeout(scrollTimer);
                        scrollTimer = null;
                    }
                    if (floatBtn) floatBtn.classList.remove('visible');
                    if (endOverlay) endOverlay.classList.remove('visible');
                }

                // 2. Start Page Overlay Logic (Top)
                const isAtTop = mainContent.scrollTop < 50;

                if (isAtTop) {
                    if (startOverlay) startOverlay.classList.add('visible');
                } else {
                    if (startOverlay) startOverlay.classList.remove('visible');
                }

                // 3. Scroll Indicator Logic
                if (scrollIndicator) {
                    const scrollTop = mainContent.scrollTop;
                    if (scrollTop > 100) {
                        scrollIndicator.style.opacity = '0';
                    } else {
                        if (scrollTop > 50) {
                            scrollIndicator.classList.remove('visible');
                        } else if (mainContent.scrollHeight > mainContent.clientHeight + 50) {
                            scrollIndicator.classList.add('visible');
                        }
                    }
                }
            });

            if (floatBtn) {
                floatBtn.addEventListener('click', () => {
                    const nextBtn = document.getElementById('nextChapterBtn');
                    if (nextBtn) nextBtn.click();
                    floatBtn.classList.remove('visible');
                });
            }
        }

        // Book buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.book-btn')) {
                const btn = e.target.closest('.book-btn');
                this.data.selectedBook = {
                    id: parseInt(btn.dataset.id),
                    name: btn.dataset.name,
                    chapters: parseInt(btn.dataset.chapters)
                };
                this.renderChapters();
                this.showView('chapters');
            }

            if (e.target.closest('.chapter-btn')) {
                const btn = e.target.closest('.chapter-btn');
                this.data.selectedChapter = parseInt(btn.dataset.chapter);
                this.renderVerses();
                this.showView('verses');
            }

            // Search Result Click
            if (e.target.closest('.search-result')) {
                const btn = e.target.closest('.search-result');
                const bookId = parseInt(btn.dataset.bookid);
                const names = [...this.books.old.map(b => b.name), ...this.books.new.map(b => b.name)];
                const bookName = names[bookId - 1];

                // We need the chapter count for the book object
                // We can get it from our books array
                let chapters = 0;
                if (bookId <= 39) chapters = this.books.old[bookId - 1].chapters;
                else chapters = this.books.new[bookId - 40].chapters;

                this.data.selectedBook = {
                    id: bookId,
                    name: bookName,
                    chapters: chapters
                };
                this.data.selectedChapter = parseInt(btn.dataset.chapter);

                // Set highlight state for rendering
                this.data.highlight = {
                    verse: parseInt(btn.dataset.verse),
                    query: btn.dataset.query
                };

                // Automatically toggle English for the searched result
                const verseKey = `${this.data.selectedBook.id}-${this.data.selectedChapter}-${this.data.highlight.verse}`;
                if (this.data.enRaw) {
                    this.data.visibleEnglish.add(verseKey);
                }

                this.renderVerses();
                this.showView('verses');
                this.hideModal();

                // Scroll to verse
                setTimeout(() => {
                    const verseEl = document.querySelector(`.verse-item[data-verse="${this.data.highlight.verse}"]`);
                    if (verseEl) {
                        verseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    // Clear highlight after some time? Or keep it? 
                    // Usually we keep it until next nav.
                    // But we want to modify renderVerses to use this.data.highlight
                }, 100);
            }

            // Bookmark icon click
            if (e.target.closest('.bookmark-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.bookmark-btn');
                const verseNum = parseInt(btn.dataset.verse);
                this.toggleBookmark(verseNum);
            }

            // Copy verse text
            if (e.target.closest('.copy-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.copy-btn');
                const verseItem = btn.closest('.verse-item');
                let textToCopy = '';
                
                if (verseItem) {
                    const bookName = this.data.selectedBook.name;
                    const chapterNum = this.data.selectedChapter;
                    const verseNum = btn.dataset.verse;
                    const verseContent = verseItem.querySelector('.verse-content').textContent;
                    const englishEl = verseItem.querySelector('.english-verse-content');
                    const englishContent = englishEl ? `\n\n${englishEl.textContent}` : '';
                    textToCopy = `${verseContent}${englishContent} \n(${bookName} ${chapterNum}:${verseNum})`;
                } else {
                    textToCopy = btn.dataset.text || '';
                }

                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalInner = btn.innerHTML;
                    btn.innerHTML = '<span style="font-size: 16px; color: var(--success-color); font-weight: bold;">✓</span>';
                    setTimeout(() => {
                        btn.innerHTML = originalInner;
                    }, 1500);
                }).catch(err => console.error('Failed to copy: ', err));
            }

            // Share verse text
            if (e.target.closest('.share-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.share-btn');
                const verseItem = btn.closest('.verse-item');
                
                if (verseItem && navigator.share) {
                    const bookName = this.data.selectedBook.name;
                    const chapterNum = this.data.selectedChapter;
                    const verseNum = btn.dataset.verse;
                    const verseContent = verseItem.querySelector('.verse-content').textContent;
                    const englishEl = verseItem.querySelector('.english-verse-content');
                    const englishContent = englishEl ? `\n\n${englishEl.textContent}` : '';
                    
                    navigator.share({
                        title: 'Bible Verse',
                        text: `${verseContent}${englishContent} \n(${bookName} ${chapterNum}:${verseNum})`
                    }).catch(err => console.error('Share failed:', err));
                } else if (!navigator.share) {
                    alert('Sharing is not supported on this device/browser.');
                }
            }

            if (e.target.closest('.toolbar-btn')) {
                const action = e.target.closest('.toolbar-btn').dataset.action;
                if (action === 'books') {
                    document.querySelector('.header h1').textContent = 'സത്യവേദപുസ്തകം';
                    document.querySelector('.header p').textContent = 'Old & New Testaments';
                    this.showView('books');
                    this.hideModal();
                }
                else if (action === 'settings') this.showModal('settingsModal');
                else if (action === 'bookmarks') {
                    this.renderBookmarks();
                    this.showModal('bookmarksModal');
                }
                else if (action === 'search') this.showModal('searchModal');
                else if (action === 'notes') {
                    this.renderNotes();
                    this.showModal('notesModal');
                }
                else if (action === 'dailyPlan') {
                    this.updateDailyUI();
                    this.renderHistory();
                    this.showModal('dailyModal');
                }
            }

            // Toggle History Button
            if (e.target.closest('#toggleHistoryBtn')) {
                const historyList = document.getElementById('historyList');
                const toggleBtn = e.target.closest('#toggleHistoryBtn');

                if (historyList.classList.contains('hidden')) {
                    historyList.classList.remove('hidden');
                    toggleBtn.textContent = 'Hide';
                    this.renderReadingHistory();
                } else {
                    historyList.classList.add('hidden');
                    toggleBtn.textContent = 'Show';
                }
            }

            if (e.target.closest('.close-btn') || e.target.closest('.close-btn-text')) {
                this.hideModal();
            }

            if (e.target.id === 'modalOverlay') {
                this.hideModal();
            }

            // Handle Chapter Bookmark Button in header
            if (e.target.closest('#bookmarkChapterBtn')) {
                e.stopPropagation();
                this.toggleChapterBookmark();
            }

            // Handle EN click
            if (e.target.closest('.en-btn')) {
                const btn = e.target.closest('.en-btn');
                const verseNum = parseInt(btn.dataset.verse);
                const verseKey = `${this.data.selectedBook.id}-${this.data.selectedChapter}-${verseNum}`;

                if (this.data.visibleEnglish.has(verseKey)) {
                    this.data.visibleEnglish.delete(verseKey);
                } else {
                    this.data.visibleEnglish.add(verseKey);
                }
                this.renderVerses();
            }


            // Handle Bookmark Delete (verse or chapter)
            if (e.target.closest('.delete-bookmark-btn')) {
                const btn = e.target.closest('.delete-bookmark-btn');
                // Chapter bookmark delete?
                if (btn.dataset.chbindex !== undefined) {
                    const idx = parseInt(btn.dataset.chbindex);
                    this.data.chapterBookmarks.splice(idx, 1);
                    localStorage.setItem('bibleChapterBookmarks', JSON.stringify(this.data.chapterBookmarks));
                    this.renderBookmarks();
                    this.updateChapterBookmarkBtn();
                } else {
                    const idx = parseInt(btn.dataset.index);
                    this.data.bookmarks.splice(idx, 1);
                    this.saveUserContent();
                    this.renderBookmarks();
                    if (this.data.view === 'verses') {
                        this.renderVerses();
                    }
                }
            }
            // Handle Chapter Bookmark Navigation (click on chapter bookmark content)
            else if (e.target.closest('.chapter-bookmark-content')) {
                const idx = parseInt(e.target.closest('.chapter-bookmark-content').dataset.chbindex);
                const cb = this.data.chapterBookmarks[idx];
                if (cb) {
                    let chapters = 0;
                    if (cb.bookId <= 39) chapters = this.books.old[cb.bookId - 1].chapters;
                    else chapters = this.books.new[cb.bookId - 40].chapters;
                    this.data.selectedBook = { id: cb.bookId, name: cb.book, chapters };
                    this.data.selectedChapter = cb.chapter;
                    this.renderVerses();
                    this.showView('verses');
                    this.hideModal();
                    document.getElementById('mainContent').scrollTop = 0;
                }
            }
            // Handle Verse Bookmark Navigation (click on content)
            else if (e.target.closest('.bookmark-content')) {
                const idx = parseInt(e.target.closest('.bookmark-content').dataset.index);
                const bookmark = this.data.bookmarks[idx];

                // Find book ID
                const names = [...this.books.old.map(b => b.name), ...this.books.new.map(b => b.name)];
                const bookIndex = names.indexOf(bookmark.book);

                if (bookIndex !== -1) {
                    const bookId = bookIndex + 1;

                    // Get chapters count
                    let chapters = 0;
                    if (bookId <= 39) chapters = this.books.old[bookId - 1].chapters;
                    else chapters = this.books.new[bookId - 40].chapters;

                    this.data.selectedBook = {
                        id: bookId,
                        name: bookmark.book,
                        chapters: chapters
                    };
                    this.data.selectedChapter = bookmark.chapter;

                    this.renderVerses();
                    this.showView('verses');
                    this.hideModal();

                    // Optional: Scroll to verse
                    setTimeout(() => {
                        const verseEl = document.querySelector(`.verse-item[data-verse="${bookmark.verse}"]`);
                        if (verseEl) {
                            verseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            verseEl.classList.add('highlight-bookmark');
                            setTimeout(() => verseEl.classList.remove('highlight-bookmark'), 2000);
                        }
                    }, 300);
                }
            }
        });

        // Font size
        // Zoom Controls - Limited to 2 clicks up/down
        const updateZoom = () => {
            document.documentElement.style.setProperty('--verse-size', `${this.data.fontSize}px`);
            localStorage.setItem('bibleFontSize', this.data.fontSize);
        };
        // Initialize on load
        updateZoom();

        const zoomInBtn = document.getElementById('zoomInBtn');
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                // Default is 10, max is 20
                if (this.data.fontSize < 20) {
                    this.data.fontSize += 2;
                    updateZoom();
                }
            });
        }

        const zoomOutBtn = document.getElementById('zoomOutBtn');
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                // Default is 10, min is 8
                if (this.data.fontSize > 8) {
                    this.data.fontSize -= 2;
                    updateZoom();
                }
            });
        }

        // Dark mode
        document.getElementById('toggleDark').addEventListener('click', function () {
            const isActive = !this.classList.contains('active');

            // Disable other themes
            if (isActive) {
                const togglePaper = document.getElementById('togglePaperTheme');
                const toggleBW = document.getElementById('toggleBWTheme');

                if (togglePaper) togglePaper.classList.remove('active');
                if (toggleBW) toggleBW.classList.remove('active');
                const toggleXP = document.getElementById('toggleXPTheme');
                if (toggleXP) toggleXP.classList.remove('active');


                Bible.data.settings.xpTheme = false;
                Bible.saveSettings();
            }

            this.classList.toggle('active');
            Bible.data.darkMode = this.classList.contains('active');
            // Toggle dark mode class on body
            document.body.classList.toggle('dark-mode', Bible.data.darkMode);
            // Save preference
            localStorage.setItem('darkMode', Bible.data.darkMode);
            Bible.applySettings();
        });

        // Search
        // Search
        const performSearch = () => {
            const query = document.getElementById('searchInput').value.toLowerCase();
            if (query.length < 1) return;

            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">Searching...</div>';

            // Allow UI to update before heavy processing
            setTimeout(() => {
                let matches = [];
                // Check if data is loaded
                if (this.data.raw && this.data.raw.Book) {
                    this.data.raw.Book.forEach((book, bIndex) => {
                        if (book.Chapter) {
                            book.Chapter.forEach((chapter, cIndex) => {
                                if (chapter.Verse) {
                                    chapter.Verse.forEach((verse, vIndex) => {
                                        const malText = verse.Verse || '';
                                        let engText = '';
                                        
                                        // Get parallel English text if available
                                        if (this.data.enRaw && this.data.enRaw.Book && this.data.enRaw.Book[bIndex]) {
                                            const enBook = this.data.enRaw.Book[bIndex];
                                            if (enBook.Chapter && enBook.Chapter[cIndex] && enBook.Chapter[cIndex].Verse && enBook.Chapter[cIndex].Verse[vIndex]) {
                                                engText = enBook.Chapter[cIndex].Verse[vIndex].Verse || '';
                                            }
                                        }

                                        const matchMal = malText.toLowerCase().includes(query);
                                        const matchEng = engText.toLowerCase().includes(query);

                                        if (matchMal || matchEng) {
                                            matches.push({
                                                bookId: bIndex + 1,
                                                chNum: cIndex + 1,
                                                vNum: vIndex + 1,
                                                bookName: (bIndex < 39) ? this.books.old[bIndex].name : this.books.new[bIndex - 39].name,
                                                text: malText,
                                                engText: engText
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                // Reset State
                this.data.searchState = {
                    matches: matches,
                    renderedCount: 0,
                    query: query
                };

                this.appendSearchBatch();

            }, 50);
        };

        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchTriggerBtn');
        const clearBtn = document.getElementById('clearSearchBtn');
        const resultsDiv = document.getElementById('searchResults');

        // Infinite Scroll
        if (resultsDiv) {
            resultsDiv.addEventListener('scroll', () => {
                if (resultsDiv.scrollTop + resultsDiv.clientHeight >= resultsDiv.scrollHeight - 50) {
                    this.appendSearchBatch();
                }
            });
        }


        const toggleClearBtn = () => {
            if (searchInput.value.length > 0) {
                clearBtn.style.display = 'flex';
            } else {
                clearBtn.style.display = 'none';
            }
        };

        if (searchBtn) {
            searchBtn.addEventListener('click', performSearch);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                document.getElementById('searchResults').innerHTML = '';
                toggleClearBtn();
                searchInput.focus();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    performSearch();
                }
            });
            searchInput.addEventListener('input', toggleClearBtn);
        }

        // Notes
        document.getElementById('saveNoteBtn').addEventListener('click', () => {
            const input = document.getElementById('noteInput');
            if (input.value.trim()) {
                this.data.notes.push({
                    text: input.value,
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString()
                });
                this.saveUserContent();
                input.value = '';
                this.renderNotes();
            }
        });

        document.getElementById('noteInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('saveNoteBtn').click();
            }
        });

        // Handle Note Delete
        document.getElementById('notesList').addEventListener('click', (e) => {
            if (e.target.closest('.delete-note-btn')) {
                const idx = parseInt(e.target.closest('.delete-note-btn').dataset.index);
                this.data.notes.splice(idx, 1);
                this.saveUserContent();
                this.renderNotes();
            }
        });

        // Navigation Buttons
        document.getElementById('homeBtn').addEventListener('click', () => {
            this.showView('books');
            this.renderBooks();
        });

        document.getElementById('chaptersBtn').addEventListener('click', () => {
            if (this.data.selectedBook) {
                this.renderChapters(); // Ensure chapters are rendered for current book
                this.showView('chapters');
            }
        });

        document.getElementById('prevChapterBtn').addEventListener('click', () => {
            if (this.data.view === 'chapters') {
                if (this.data.selectedBook.id > 1) {
                    const prevBookId = this.data.selectedBook.id - 1;
                    let prevBook;
                    if (prevBookId <= 39) prevBook = this.books.old[prevBookId - 1];
                    else prevBook = this.books.new[prevBookId - 40];

                    this.data.selectedBook = prevBook;
                    this.renderChapters();
                }
                return;
            }

            if (this.data.selectedChapter > 1) {
                this.data.selectedChapter--;
                this.renderVerses();
            } else {
                // Previous Book
                if (this.data.selectedBook.id > 1) {
                    const prevBookId = this.data.selectedBook.id - 1;
                    let prevBook;
                    if (prevBookId <= 39) prevBook = this.books.old[prevBookId - 1];
                    else prevBook = this.books.new[prevBookId - 40];

                    this.data.selectedBook = prevBook;
                    this.data.selectedChapter = prevBook.chapters; // Go to last chapter
                    this.renderVerses();
                }
            }
            document.getElementById('mainContent').scrollTop = 0;
        });

        document.getElementById('nextChapterBtn').addEventListener('click', () => {
            if (this.data.view === 'chapters') {
                if (this.data.selectedBook.id < 66) {
                    const nextBookId = this.data.selectedBook.id + 1;
                    let nextBook;
                    if (nextBookId <= 39) nextBook = this.books.old[nextBookId - 1];
                    else nextBook = this.books.new[nextBookId - 40];

                    this.data.selectedBook = nextBook;
                    this.renderChapters();
                }
                return;
            }

            if (this.data.selectedChapter < this.data.selectedBook.chapters) {
                this.data.selectedChapter++;
                this.renderVerses();
            } else {
                // Next Book
                if (this.data.selectedBook.id < 66) {
                    const nextBookId = this.data.selectedBook.id + 1;
                    let nextBook;
                    if (nextBookId <= 39) nextBook = this.books.old[nextBookId - 1];
                    else nextBook = this.books.new[nextBookId - 40];

                    this.data.selectedBook = nextBook;
                    this.data.selectedChapter = 1;
                    this.renderVerses();
                }
            }
            document.getElementById('mainContent').scrollTop = 0;
        });
    },

    renderHistory() {
        const historyList = document.getElementById('historyList');
        if (!this.data.readingHistory.length) {
            historyList.innerHTML = '<div class="empty-state">No reading history yet.</div>';
            return;
        }

        // Group by DateString for Timeline
        const grouped = {};
        this.data.readingHistory.forEach(item => {
            // Use dateString for grouping (day level), fallback to parsing date
            let groupingDate = item.dateString;
            if (!groupingDate) {
                try {
                    groupingDate = new Date(item.date).toDateString();
                } catch (e) {
                    groupingDate = 'Unknown Date';
                }
            }
            if (!grouped[groupingDate]) grouped[groupingDate] = [];
            grouped[groupingDate].push(item);
        });

        // Sort dates descending
        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        let html = '';
        sortedDates.forEach(date => {
            const items = grouped[date];
            html += `
                <div class="history-date-group">
                    <div class="history-date-header">
                        <span class="history-date">${date}</span>
                        <span class="history-count">${items.length} Chapters</span>
                    </div>
                    <div class="history-chapters">
            `;

            items.forEach(item => {
                // Format time
                let timeStr = '';
                try {
                    timeStr = new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } catch (e) {
                    timeStr = '';
                }

                html += `
                    <div class="history-chapter-item">
                        <span class="history-book">${item.bookName || item.book || 'Unknown Book'}</span>
                        <span class="history-chapter-num">Ch. ${item.chapter} <span style="font-weight:normal; opacity:0.7; font-size:11px; margin-left:4px;">(${timeStr})</span></span>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        historyList.innerHTML = html;
        historyList.classList.remove('hidden'); // Ensure visible
        const toggleBtn = document.getElementById('toggleHistoryBtn');
        if (toggleBtn) toggleBtn.style.display = 'none'; // Hide toggle button
    },

    initializeSettingsToggles() {
        // Set initial toggle states
        const togglePressHold = document.getElementById('togglePressHold');
        const toggleVerseButtons = document.getElementById('toggleVerseButtons');
        const toggleCenterView = document.getElementById('toggleCenterView');


        if (this.data.settings.disablePressHold && togglePressHold) togglePressHold.classList.add('active');
        if (this.data.settings.hideVerseButtons && toggleVerseButtons) toggleVerseButtons.classList.add('active');
        if (this.data.settings.centerView && toggleCenterView) toggleCenterView.classList.add('active');


        // Add event listeners
        if (togglePressHold) {
            togglePressHold.addEventListener('click', () => {
                togglePressHold.classList.toggle('active');
                this.data.settings.disablePressHold = togglePressHold.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }

        if (toggleVerseButtons) {
            toggleVerseButtons.addEventListener('click', () => {
                toggleVerseButtons.classList.toggle('active');
                this.data.settings.hideVerseButtons = toggleVerseButtons.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }

        if (toggleCenterView) {
            toggleCenterView.addEventListener('click', () => {
                toggleCenterView.classList.toggle('active');
                this.data.settings.centerView = toggleCenterView.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }

        const toggleBoldText = document.getElementById('toggleBoldText');
        if (this.data.settings.boldText && toggleBoldText) toggleBoldText.classList.add('active');

        if (toggleBoldText) {
            toggleBoldText.addEventListener('click', () => {
                toggleBoldText.classList.toggle('active');
                this.data.settings.boldText = toggleBoldText.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }

        const toggleXPTheme = document.getElementById('toggleXPTheme');
        if (this.data.settings.xpTheme && toggleXPTheme) toggleXPTheme.classList.add('active');

        if (toggleXPTheme) {
            toggleXPTheme.addEventListener('click', () => {
                const isActive = !toggleXPTheme.classList.contains('active');
                if (isActive) {
                    // Disable others
                    const toggleDark = document.getElementById('toggleDark');
                    const togglePaper = document.getElementById('togglePaperTheme');
                    const toggleBW = document.getElementById('toggleBWTheme');

                    if (toggleDark) toggleDark.classList.remove('active');
                    if (togglePaper) togglePaper.classList.remove('active');
                    if (toggleBW) toggleBW.classList.remove('active');

                    this.data.darkMode = false;
                    this.data.settings.paperTheme = false;
                    this.data.settings.bwTheme = false;
                }
                toggleXPTheme.classList.toggle('active');
                this.data.settings.xpTheme = toggleXPTheme.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }

        const toggleNavShape = document.getElementById('toggleNavShape');
        if (this.data.settings.disableSquareNav && toggleNavShape) toggleNavShape.classList.add('active');

        if (toggleNavShape) {
            toggleNavShape.addEventListener('click', () => {
                toggleNavShape.classList.toggle('active');
                this.data.settings.disableSquareNav = toggleNavShape.classList.contains('active');
                this.saveSettings();
                this.applySettings();
            });
        }
    },

    applySettings() {
        // ... (existing)
        const mainContent = document.getElementById('mainContent');
        const versesList = document.getElementById('versesList');

        // Apply Theme — mutually exclusive
        if (this.data.darkMode) {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('xp-blue-theme');
        } else if (this.data.settings.xpTheme) {
            document.body.classList.add('xp-blue-theme');
            document.body.classList.remove('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
            document.body.classList.remove('xp-blue-theme');
        }

        // Apply center view ONLY for verses view
        if (this.data.settings.centerView && this.data.view === 'verses' && versesList) {
            versesList.style.maxWidth = '800px';
            versesList.style.marginLeft = 'auto';
            versesList.style.marginRight = 'auto';
            versesList.classList.add('center-text');
        } else if (versesList) {
            versesList.style.maxWidth = '';
            versesList.style.marginLeft = '';
            versesList.style.marginRight = '';
            versesList.classList.remove('center-text');
        }

        // Apply Square Navigation
        if (!this.data.settings.disableSquareNav) {
            document.body.classList.add('nav-square');
        } else {
            document.body.classList.remove('nav-square');
        }

        // Apply Bold Text
        if (this.data.settings.boldText) {
            document.body.classList.add('bold-verse-text');
        } else {
            document.body.classList.remove('bold-verse-text');
        }

        // Re-render verses if in verses view to update bookmark button visibility
        if (this.data.view === 'verses' && this.data.selectedBook && this.data.selectedChapter) {
            this.renderVerses();
        }
    },

    saveSettings() {
        localStorage.setItem('bibleSettings', JSON.stringify(this.data.settings));
    },

    initRippleEffect() {
        const createRipple = (e) => {
            // Check if we are tapping a button or interactive element
            const target = e.target.closest('button, .btn, .nav-item, .book-btn, .chapter-btn, .action-btn, .save-btn, .primary-btn, .secondary-btn, .text-btn, .last-read-btn, .note-item, .bookmark-item, .toolbar-btn, .floating-next-btn');

            if (target) {
                // Remove any existing ripples to prevent buildup
                const existing = target.querySelectorAll('.ripple');
                existing.forEach(r => r.remove());

                const rect = target.getBoundingClientRect();
                const circle = document.createElement('span');
                const diameter = Math.max(rect.width, rect.height);
                const radius = diameter / 2;

                // Position the ripple relative to the clicked element
                circle.style.width = circle.style.height = `${diameter}px`;
                circle.style.left = `${e.clientX - rect.left - radius}px`;
                circle.style.top = `${e.clientY - rect.top - radius}px`;
                circle.classList.add('ripple');

                target.appendChild(circle);

                // Clean up via animation end or timeout
                setTimeout(() => {
                    circle.remove();
                }, 600);
            }
        };

        // Use pointerdown for instant reaction on both Touch and Mouse
        document.addEventListener('pointerdown', createRipple);
    }
};

Bible.init();
Bible.initRippleEffect();
