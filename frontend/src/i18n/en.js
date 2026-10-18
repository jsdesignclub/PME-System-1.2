/**
 * English — the master dictionary.
 *
 * ============================================================================
 * THIS FILE IS THE KEY LIST, AND `si.js` MUST MATCH IT
 * ============================================================================
 *
 * English is the source of truth for what keys exist, because it is the fallback
 * in `LanguageContext.t()`. A key present only in Sinhala would never be reached
 * and would silently rot; a key missing from Sinhala degrades to English and is
 * logged in development. So the direction of completeness is one-way, and that
 * asymmetry is what makes a partial translation safe to ship.
 *
 * Keys are namespaced by area, not by component file, so a string that appears in
 * three places is defined once. Where two screens genuinely need different words
 * for the same idea — a button that is `Save` on one screen and `Close` on
 * another — they are separate keys on purpose.
 *
 * `{placeholder}` markers are substituted by `t()`. A missing value renders empty
 * rather than as the literal brace; see `interpolate()`.
 */
export const en = Object.freeze({
  // --- Application identity ------------------------------------------------
  'app.ministry': 'Ministry of Sport, Uva Province',
  'app.title': 'Enterprise Management System',
  'app.titleDocument': 'EMS — Ministry of Sport, Uva Province',
  'app.emblem': 'Ministry emblem',

  // --- Language ------------------------------------------------------------
  'lang.toggle': 'Change language',
  'lang.current': 'Current language: {language}',
  'lang.switchTo': 'Switch to {language}',

  // --- Navigation ----------------------------------------------------------
  'nav.dashboard': 'Dashboard',
  'nav.registry': 'Letter Registry',
  'nav.officers': 'Officers',
  'nav.admin': 'Administration',
  'nav.vehicles': 'Vehicles',
  'nav.transfers': 'Staff Transfers',
  'nav.inventory': 'Inventory',
  'nav.modules': 'Modules',
  'nav.menu': 'Modules',
  'nav.collapse': 'Collapse',
  'nav.expand': 'Expand',
  'nav.comingLater': 'Coming later',
  'nav.phase': 'Phase',
  'nav.signOut': 'Sign out',
  'nav.openMenu': 'Open module menu',
  'shell.workspace': 'Workspace',
  'shell.systemOnline': 'System online',
  'nav.closeMenu': 'Close module menu',

  // --- Authentication ------------------------------------------------------
  'auth.signIn': 'Sign in',
  'auth.tagline': 'Enter your email address and password to continue.',
  'auth.nic': 'email address',
  'auth.nicPlaceholder': 'your-email@gmail.com',
  'auth.password': 'Password',
  'auth.signingIn': 'Signing in…',
  'auth.failed': 'Sign-in failed.',
  'auth.demoHint': 'Demo accounts are listed in README.md',

  // --- Generic actions and labels -----------------------------------------
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.close': 'Close',
  'common.apply': 'Apply',
  'common.clear': 'Clear',
  'common.search': 'Search',
  'common.refresh': 'Refresh',
  'common.reload': 'Reload the page',
  'common.tryAgain': 'Try again',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.page': 'Page',
  'common.of': 'of',
  'common.actions': 'Actions',
  'common.all': 'All',
  'common.none': 'None',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.required': 'Required',
  'common.optional': 'Optional',
  'common.name': 'Name',
  'common.code': 'Code',
  'common.description': 'Description',
  'common.status': 'Status',
  'common.role': 'Role',
  'common.department': 'Department',
  'common.section': 'Section',
  'common.date': 'Date',
  'common.from': 'From',
  'common.to': 'To',
  'common.total': 'Total',
  'common.loading': 'Loading',
  'common.dismiss': 'Dismiss',
  'common.back': 'Back',
  'common.confirm': 'Confirm',
  'common.showing': 'Showing {from}–{to} of {total}',
  'common.noResults': 'Nothing to show.',
  'common.optionalField': 'optional',

  // --- Workflow states -----------------------------------------------------
  'status.Logged': 'Logged',
  'status.Forwarded to AO': 'Forwarded to AO',
  'status.Forwarded to Subject': 'Forwarded to Subject',
  'status.Assigned': 'Assigned',
  'status.In Progress': 'In Progress',
  'status.Pending Approval': 'Pending Approval',
  'status.Completed': 'Completed',
  'status.unknown': 'Unrecognised status: {status}',
  'status.railLabel': 'Workflow progress',
  'status.railMinutes': 'Minutes written — this is the endorsement that forwarded the letter',

  // --- Priorities ----------------------------------------------------------
  'priority.Normal': 'Normal',
  'priority.Urgent': 'Urgent',
  'priority.Confidential': 'Confidential',
  'priority.unknown': 'Unrecognised priority: {priority}',

  // --- Role badges ---------------------------------------------------------
  'role.MINOR_STAFF': 'Minor Staff',
  'role.SECRETARY': 'Secretary',
  'role.AO': 'Administrative Officer',
  'role.CHIEF_CLERK': 'Chief Clerk',
  'role.SUBJECT_CLERK': 'Subject Clerk',
  'role.DEPARTMENT_HEAD': 'Department Head',
  'role.OFFICER': 'Officer',
  'role.TRANSPORT_OFFICER': 'Transport Officer',
  'role.ADMIN': 'Administrator',

  // --- Dashboard -----------------------------------------------------------
  'dashboard.title': 'Dashboard',
  'dashboard.byState': 'By workflow state',
  'dashboard.byPriority': 'By priority',
  'dashboard.bySenderType': 'By sender type',
  'dashboard.intake': 'Intake, last 30 days',
  'dashboard.latestLetters': 'Latest letters',
  'dashboard.openRegistry': 'Open the registry',
  'dashboard.noLetters': 'No letters yet.',
  'dashboard.nothingWaiting': 'Nothing is waiting on you.',
  'dashboard.waitingForYou': 'Waiting for you',

  // --- Letter registry -----------------------------------------------------
  'registry.title': 'Letter Registry',
  'registry.logLetter': 'Log a letter',
  'registry.allStates': 'All states',
  'registry.allPriorities': 'All priorities',
  'registry.allSenders': 'All senders',
  'registry.filters': 'Filters',
  'registry.clearFilters': 'Clear the filters, or log a new letter to start a file.',
  'registry.noMatches': 'No letter matches these filters.',
  'registry.searchPlaceholder': 'Search reference, subject or sender',

  // --- Letter detail -------------------------------------------------------
  'mail.title': 'Letter',
  'mail.dayStamp': 'Day stamp',
  'mail.reference': 'Reference',
  'mail.subject': 'Subject',
  'mail.sender': 'Sender',
  'mail.senderType': 'Sender type',
  'mail.received': 'Received',
  'mail.category': 'Category',
  'mail.officer': 'Officer',
  'mail.assignedOfficer': 'Assigned officer',
  'mail.notYetAssigned': 'Not yet assigned',
  'mail.assignedOn': 'Assigned on',
  'mail.completedOn': 'Completed on',
  'mail.officerNote': 'Routing note',
  'mail.hasAttachment': 'A scan is attached',
  'mail.noAttachment': 'No scan is attached',
  'mail.openLetter': 'Open the letter',
  'mail.backToRegistry': '← Back to the letter registry',
  'mail.couldNotOpen': 'That letter could not be opened.',
  'mail.unassigned': 'Unassigned',

  // --- Minutes and activity ------------------------------------------------
  'minutes.title': 'Minutes and activity',
  'minutes.add': 'Add minutes and forward',
  'minutes.instruction': 'Instruction',
  'minutes.endorsement': 'Endorsement',
  'minutes.instructionType': 'Instruction type',
  'minutes.endorsementPlaceholder':
    'The proposal is noted. The subject matter sits with the District Officer; forwarded to the subject clerk for routing.',
  'minutes.activity': 'Activity',
  'minutes.noneYet': 'No minutes yet.',
  'minutes.noActivity': 'No recorded activity.',
  'minutes.forwardExplained':
    'A letter is forwarded to the subject by an executive writing the endorsement.',
  'minutes.print': 'Print minute slip',
  'minutes.slipTitle': 'Minute Slip',
  'minutes.noEndorsement': 'No endorsement has been recorded against this letter yet.',

  // --- Attachments ---------------------------------------------------------
  'attachment.title': 'Attachments',
  'attachment.none': 'No scan is attached to this letter.',
  'attachment.preview': 'Preview',
  'attachment.open': 'Open',
  'attachment.add': 'Add files',
  'attachment.uploading': 'Uploading…',
  'attachment.download': 'Download',
  'attachment.certificateHint':
    'A clearance certificate, completion certificate, or any document closing the file.',
  'attachment.closedNotice': 'This letter is closed. Attachments can no longer be added.',

  // --- Officer progress and completion -------------------------------------
  'officer.progress': 'Progress',
  'officer.progressNote': 'Progress note',
  'officer.notePlaceholder': 'Site visit on 3 October; quotations being called.',
  'officer.saveNote': 'Save note',
  'officer.yourActions': 'Your actions',
  'officer.startHelp':
    'Starting moves this letter to In Progress and records the start against your name.',
  'officer.completeHelp':
    'Completing closes the file. The completion date is written automatically.',
  'officer.closed': 'This letter is closed. Attachments can no longer be added.',
  'officer.otherRole': 'The next step belongs to another role in the workflow.',
  'officer.refreshLetter': 'Refresh this letter',
  'officer.actionFailed': 'That action did not go through.',
  'officer.notes': 'Notes',

  // --- Assignment ----------------------------------------------------------
  'assign.title': 'Assign an officer',
  'assign.why': 'Why this officer, and what is expected.',
  'assign.suggested': 'Suggested officer',
  'assign.noSuggestion': 'No suggestion yet.',
  'assign.noMatch': 'No duty chart matches this letter.',
  'assign.notAssignedWarning': 'Selected above is not assigned. Press',
  'assign.thisLetter': 'Assign this letter',
  'assign.assigned': 'Assigned to {name}.',
  'assign.failed': 'That letter could not be assigned.',
  'assign.select': 'Select an officer',

  // --- Officers and duty charts --------------------------------------------
  'officers.title': 'Officers',
  'officer.none': 'No active officers.',
  'officer.noDuties': 'No duties recorded.',
  'officer.noDutyRows':
    'This officer holds no duty rows, so the matcher can never rank them.',
  'officer.duties': 'Duties',
  'officer.dutyChart': 'Duty chart',

  // --- Logging a new letter ------------------------------------------------
  'new.title': 'Log a letter',
  'new.backToRegistry': 'Back to the registry',
  'new.incoming': 'Incoming letter',
  'new.receivedOn': 'Received on',
  'new.senderReference': 'Sender reference',
  'new.senderType': 'Sender type',
  'new.sender': 'Sender',
  'new.senderPlaceholder': 'Department of Provincial Education',
  'new.subject': 'Subject',
  'new.subjectPlaceholder':
    'Tender for procurement of laboratory equipment for provincial schools',
  'new.referencePlaceholder': 'EDU/2026/TND/0142',
  'new.priority': 'Priority',
  'new.category': 'Category',
  'new.categoryPlaceholder': 'General Administration',
  'new.categoryError': 'The category list could not be loaded.',
  'new.attachment': 'Scan or attachment',
  'new.dropHere': 'Drop the scan here, or choose a file',
  'new.languageHint':
    'Sinhala and Tamil subjects are matched against the duty charts.',
  'new.filed': 'Letter filed.',
  'new.openLetter': 'Open the letter',
  'new.fileAnother': 'File another',
  'new.failed': 'That letter could not be logged.',

  // --- Administration ------------------------------------------------------
  'admin.title': 'Administration',
  'admin.sections': 'Administration sections',
  'admin.subtitle':
    'Signed in as {name} ({role}). Only Duty Charts is writable outside the administrator role.',
  'admin.noTabs': 'No administration tab is available to your role.',
  'admin.tabUsers': 'Users',
  'admin.tabDepartments': 'Departments',
  'admin.tabDuties': 'Duty Charts',
  'admin.tabSettings': 'Settings',
  'admin.tabAudit': 'Audit Log',

  'admin.users.title': 'Users',
  'admin.users.search': 'Search',
  'admin.users.searchPlaceholder': 'name or NIC',
  'admin.users.allRoles': 'All roles',
  'admin.users.all': 'All',
  'admin.users.active': 'Active',
  'admin.users.deactivated': 'Deactivated',
  'admin.users.add': 'Add a user',
  'admin.users.addTitle': 'Add a user',
  'admin.users.fullName': 'Full name',
  'admin.users.nic': 'NIC',
  'admin.users.email': 'Email',
  'admin.users.nicHint': 'Required, and unique across the directory.',
  'admin.users.designation': 'Designation',
  'admin.users.noDepartment': 'No department',
  'admin.users.password': 'Password',
  'admin.users.passwordHint':
    'Stored as a bcrypt hash and never returned by any endpoint.',
  'admin.users.noMatches': 'No users match these filters.',
  'admin.users.deactivate': 'Deactivate this user',
  'admin.users.failed': 'That user could not be saved.',

  'admin.departments.title': 'Departments',
  'admin.departments.add': 'Add a department',
  'admin.departments.none': 'No departments yet.',
  'admin.departments.name': 'Name',
  'admin.departments.code': 'Code',
  'admin.departments.failed': 'That department could not be saved.',

  'admin.settings.intro':
    'Define the categories a letter may be logged under, the action each requires, and the maximum days to complete it.',
  'admin.settings.count': '{count} categories.',
  'admin.settings.add': 'Add a category',
  'admin.settings.none': 'No letter categories yet.',
  'admin.settings.name': 'Category name',
  'admin.settings.namePlaceholder': 'Project Report',
  'admin.settings.nameHint': 'Unique. What the intake form shows and what a letter stores.',
  'admin.settings.action': 'Action to take',
  'admin.settings.actionPlaceholder': 'Prepare project report',
  'admin.settings.actionHint': 'What the assigned officer must do for a letter of this kind.',
  'admin.settings.maxDays': 'Maximum days to complete',
  'admin.settings.maxDaysPlaceholder': '30',
  'admin.settings.maxDaysHint': 'The latest day the final action may be taken. Leave blank for no limit.',
  'admin.settings.days': 'days',
  'admin.settings.added': 'Category added.',
  'admin.settings.updated': 'Category updated.',
  'admin.settings.deleted': 'Category deleted.',
  'admin.settings.deleteTitle': 'Delete this category',
  'admin.settings.deleteMessage':
    'Delete "{name}"? Letters already logged under it keep their category text; only the dropdown entry is removed.',
  'admin.settings.failed': 'That category could not be saved.',
  'admin.settings.loadFailed': 'Categories could not be loaded.',

  'admin.duties.add': 'Add a duty',
  'admin.duties.addToSection': 'Add to this section',
  'admin.duties.section': 'Section',
  'admin.duties.sectionHint':
    'One duty per section per officer. A repeat is refused as a duplicate.',
  'admin.duties.sectionPlaceholder': 'Education — Provincial Schools',
  'admin.duties.description': 'Duty description',
  'admin.duties.descriptionPlaceholder':
    'School administration, teacher matters and examinations',
  'admin.duties.keywords': 'Keywords',
  'admin.duties.noOfficers': 'No officers to chart.',
  'admin.duties.noDuties': 'No duties recorded.',
  'admin.duties.deleteTitle': 'Delete this duty',
  'admin.duties.failed': 'That duty could not be saved.',

  'admin.audit.title': 'Audit Log',
  'admin.audit.whatChanged': 'What changed',
  'admin.audit.action': 'Action',
  'admin.audit.allActions': 'All actions',
  'admin.audit.entityType': 'Entity type',
  'admin.audit.entityId': 'Entity id',
  'admin.audit.idPlaceholder': 'letter or duty id',
  'admin.audit.noMatches': 'No audit entries match these filters.',
  'admin.audit.entryTitle': 'Audit entry',
  'admin.audit.noFieldChange': 'This entry recorded no field-level change.',
  'admin.audit.failed': 'That audit log could not be loaded.',

  // --- Access refusals -----------------------------------------------------
  'forbidden.title': 'Not permitted',
  'forbidden.body': 'You do not have access to this area.',
  'forbidden.requires': 'This area requires the {kind} {value}.',
  'forbidden.kindRole': 'role',
  'forbidden.kindPermission': 'permission',
  'forbidden.goToRegistry': 'Go to the Letter Registry',
  'forbidden.goToDashboard': 'Dashboard',

  'notFound.title': 'Page not found',
  'notFound.body': 'That address does not exist. Sign in to continue.',

  // --- Failures ------------------------------------------------------------
  'error.pageBroken': 'This page could not be displayed',
  'error.pageBrokenBody':
    'The rest of the application is still usable — the menu on the left still works. If this keeps happening, send the message above to support.',
  'error.generic': 'Something went wrong.',
  'error.network': 'The server could not be reached.',
  'error.forbidden': 'You do not have permission to do that.',
  'error.notFound': 'That record does not exist, or is not visible to you.',
  'error.conflict': 'Someone else changed this first. Refresh and try again.',

  'session.restoring': 'Restoring your session',

  'login.title': 'Sign in',
  'login.ministry': 'Ministry of Sport, Uva Province',
  'login.systemName': 'Enterprise Management System',
  'login.tagline': 'Enter your NIC number and password to continue.',
  'login.nic': 'NIC number',
  'login.nicPlaceholder': '881234564V',
  'login.password': 'Password',
  'login.showPassword': 'Show password',
  'login.hidePassword': 'Hide password',
  'login.signingIn': 'Signing in',
  'login.submit': 'Sign in',
  'login.demoHint':
    'Demo operator: the seeded accounts are published on purpose. ' +
    'Password: PmeDemo@2026. Never reuse this password outside this demo.',

  'forbidden.title': 'Not permitted',
  'forbidden.body': 'Your role does not grant this page.',
  'forbidden.requires': 'This area requires the {kind} {value}.',
  'forbidden.kindRole': 'role',
  'forbidden.kindPermission': 'permission',
  'forbidden.goToRegistry': 'Go to the Letter Registry',
  'forbidden.goToDashboard': 'Dashboard',
  'forbidden.footer':
    'If you believe you should have this, an administrator can grant it. ' +
    'The audit log records the attempt.',

  'notFound.title': 'Page not found',
  'notFound.body': 'That address does not exist. Sign in to continue.',
  'notFound.signIn': 'Sign in',
  'notFound.dashboard': 'Dashboard',
  'notFound.registry': 'Letter Registry',
  'notFound.nothingAt': 'There is nothing at {pathname}.',

  'dashboard.loadingRegistry': 'Loading registry figures',
  'dashboard.loadingQueue': 'Loading your queue',
  'dashboard.ministryTitle': 'Dashboard',
  'dashboard.byState': 'By workflow state',
  'dashboard.byStateHint':
    'Where the files sit right now — select a state to list its letters.',
  'dashboard.byPriority': 'By priority',
  'dashboard.byPriorityHint': 'Select a priority to list its letters.',
  'dashboard.bySenderType': 'By sender type',
  'dashboard.bySenderTypeHint': 'Who the ministry is receiving from.',
  'dashboard.latestLetters': 'Latest letters',
  'dashboard.latestHint': 'The six most recently received.',
  'dashboard.openRegistry': 'Open the registry',
  'dashboard.noLetters': 'No letters yet.',
  'dashboard.lettersOnRecord': 'Letters on record',
  'dashboard.lettersOnRecordHint': 'See every letter',
  'dashboard.open': 'Open',
  'dashboard.openHint': 'Still being worked',
  'dashboard.completed': 'Completed',
  'dashboard.completedHint': 'Closed and filed',
  'dashboard.overdue': 'Overdue',
  'dashboard.overdueHint': 'Open past the 30-day limit',
  'dashboard.waitingForYou': 'Letters open to you ({count})',
  'dashboard.nothingWaiting': 'Nothing is waiting on you.',
  'dashboard.queueEmpty':
    'Letters routed to {name} will appear here.',
  'dashboard.drilldownState': 'Letters in "{state}"',
  'dashboard.drilldownPriority': '{priority} letters',
  'dashboard.drilldownSender': 'Letters from {senderType}',
  'dashboard.drilldownShortfall':
    ' The tile read {figureCount}, which counts the whole registry; ' +
    'this list is what your role may see.',
  'dashboard.drilldownCount':
    '{count} letter(s) in this figure — showing the {shown} most recent. ' +
    'The rest are in the registry.',
  'dashboard.drilldownNoLetters': 'No letters match this figure.',
  'dashboard.drilldownOpenRegistry': 'Open in the registry',
  'dashboard.drilldownClose': 'Close',
  'dashboard.drilldownLoading': 'Loading letters',

  'admin.title': 'Administration',
  'admin.subtitle':
    'Signed in as {name} ({role}). Only Duty Charts is writable outside the administrator role.',
  'admin.sections': 'Administration sections',
  'admin.noTabs': 'No administration tab is available to your role.',
  'admin.tabUsers': 'Users',
  'admin.tabDepartments': 'Departments',
  'admin.tabDuties': 'Duty Charts',
  'admin.tabSettings': 'Settings',
  'admin.tabAudit': 'Audit Log',

  'officers.pageTitle': 'Officers & Duty Charts',
  'officers.pageDescription':
    'The keywords below are what the duty matcher scores a letter\'s subject against, ' +
    'in Sinhala, Tamil and English. An officer may hold duties in several sections; ' +
    'each row is a separate claim, and a claim is ranked on its own evidence.',
  'officers.title': 'Officers',
  'officers.none': 'No active officers.',
  'officers.loadingChart': 'Loading the duty chart',
  'officers.noDuties': 'No duties recorded.',
  'officers.noDutyRows':
    'This officer holds no duty rows, so the matcher can never rank them.',
  'officers.dutyChart': 'Duty chart',
  'officers.chartTitle': 'Duty chart — {name}',
  'officers.homeSection': 'Home section:',
  'officers.homeSectionMissing': 'not recorded',
  'officers.sectionsCount': '{count} duties across {sections} sections.',

  'mail.backToRegistry': '← Back to the letter registry',
  'mail.title': 'Letter',
  'mail.opening': 'Opening the letter',
  'mail.receivedOn': 'Received on',
  'mail.senderReference': 'Sender reference',
  'mail.senderType': 'Sender type',
  'mail.sender': 'Sender',
  'mail.category': 'Category',
  'mail.loggedBy': 'Logged by',
  'mail.registry': 'Registry',
  'mail.assignedOfficer': 'Assigned officer',
  'mail.notYetAssigned': 'Not yet assigned',
  'mail.assignedOn': 'Assigned on',
  'mail.completedOn': 'Completed on',
  'mail.categoryAction': 'Action to take',
  'mail.categoryDue': 'Complete by',
  'mail.categoryDueValue': 'Within {days} days — by {date}',
  'mail.categoryMaxDaysOnly': 'Within {days} days',

  'clock.title': 'Time to complete',
  'clock.statusOverdue': 'Overdue',
  'clock.statusDueSoon': 'Due soon',
  'clock.statusOnTrack': 'On track',
  'clock.days': 'Days',
  'clock.hours': 'Hrs',
  'clock.minutes': 'Min',
  'clock.seconds': 'Sec',
  'clock.dayLeft': '{days} day left',
  'clock.daysLeft': '{days} days left',
  'clock.dayOverdue': 'Overdue by {days} day',
  'clock.daysOverdue': 'Overdue by {days} days',
  'clock.allowed': 'Allowed {days} days',
  'clock.due': 'Due {date}',

  'minutes.title': 'Minutes and activity',
  'minutes.activity': 'Activity',
  'minutes.noneYet': 'No minutes yet.',
  'minutes.noActivity': 'No recorded activity.',

  'notes.title': 'Notes',
  'notes.subjectClerk': 'Subject clerk',
  'notes.officer': 'Officer',
  'notes.subjectClerkLabel': 'Subject clerk note',
  'notes.officerLabel': 'Officer progress note',
  'notes.clerkHint':
    'Classification and routing — why this letter went where it went.',
  'notes.officerHint': 'What has been done, and what is outstanding.',
  'notes.saving': 'Saving',
  'notes.save': 'Save note',
  'notes.saved': 'Note saved.',
  'notes.saveFailed': 'The note was not saved.',

  'assign.title': 'Assign an officer or branch clerk',
  'assign.officerLabel': 'Officer or branch clerk',
  'assign.choose': 'Choose an officer or branch clerk',
  'assign.officersGroup': 'Officers',
  'assign.clerksGroup': 'Branch subject clerks',
  'assign.routingNote': 'Routing note',
  'assign.routingHint': 'Why this officer or clerk, and what is expected.',
  'assign.submit': 'Assign this letter',
  'assign.submitting': 'Assigning',
  'assign.failed': 'The letter was not assigned.',
  'assign.assigned': 'Assigned to {name}.',
  'assign.routedToClerk': 'Routed to branch clerk {name}.',
  'assign.clerkAsExecutor':
    'Assign this clerk as the executor — they will work the letter themselves instead of passing it on.',
  'assign.toSelf': 'Assign this letter to myself',
  'assign.toSelfHint':
    'Take the letter as the executor: you start it, add the progress note and submit the completion report yourself.',
  'assign.selfAssigned': 'The letter is now assigned to you.',

  'nextStep.title': 'Next step',
  'nextStep.closed': 'This letter is closed. The file is complete.',
  'nextStep.otherRole':
    'The next step belongs to another role in the workflow.',

  'forward.title': 'Send to the Administrative Officer',
  'forward.help':
    'Hand the letter to the AO for the primary minute. The AO writes it on ' +
    'paper; you record it here on the next step, and the letter comes back to ' +
    'you to assign an officer.',
  'forward.submit': 'Forward to AO',
  'forward.sending': 'Forwarding',
  'forward.sent': 'Forwarded to the Administrative Officer.',
  'forward.failed': 'That letter could not be forwarded to the AO.',
  'forward.retry': 'Refresh this letter',

  'rail.title': 'Workflow progress',
  'rail.minutesTitle':
    'Minutes written — this is the endorsement that forwarded the letter',
  'rail.unrecognised': 'Unrecognised status: {status}',
  'rail.available': 'Available to you: {labels}',
  'rail.noneAvailable': 'No action is available to you at this state.',

  'print.button': 'Print minute slip',
  'print.ministry': 'Ministry of Sport, Uva Province',
  'print.slipTitle': 'Minute Slip',
  'print.dayStamp': 'Day stamp',
  'print.reference': 'Reference',
  'print.status': 'Status',
  'print.letter': 'Letter',
  'print.receivedOn': 'Received on',
  'print.senderType': 'Sender type',
  'print.sender': 'Sender',
  'print.subject': 'Subject',
  'print.category': 'Category',
  'print.priority': 'Priority',
  'print.loggedBy': 'Logged by',
  'print.registry': 'Registry',
  'print.actionOfficer': 'Action officer',
  'print.notYetAssigned': 'Not yet assigned',
  'print.completedOn': 'Completed on',
  'print.endorsement': 'Endorsement',
  'print.instruction': 'Instruction',
  'print.recordedOn': 'Recorded on',
  'print.noEndorsement':
    'No endorsement has been recorded against this letter yet.',
  'print.signatureEndorsing': 'Endorsing officer',
  'print.signatureEndorsingHint': 'Secretary or Administrative Officer',
  'print.signatureClerk': 'Subject clerk',
  'print.signatureClerkHint': 'Routing',
  'print.signatureOfficer': 'Action officer',
  'print.signatureOfficerHint': 'Execution',
  'print.fileCopy': 'File copy',
  'print.workingCopy':
    'Working copy — not a closed file (status: {status})',
  'print.printed': 'Printed {date}',

  'officerPanel.progress': 'Progress',
  'officerPanel.startHelp':
    'Starting moves this letter to In Progress and records the start against your name.',
  'officerPanel.completeHelp':
    'Completing closes the file. The completion date is written automatically.',
  'officerPanel.progressLabel': 'Progress note',
  'officerPanel.notePlaceholder':
    'Site visit on 3 October; quotations being called.',
  'officerPanel.saveNote': 'Save note',
  'officerPanel.yourActions': 'Your actions',
  'officerPanel.closed':
    'This letter is closed. Attachments can no longer be added.',
  'officerPanel.otherRole':
    'The next step belongs to another role in the workflow.',
  'officerPanel.refresh': 'Refresh this letter',
  'officerPanel.actionFailed': 'That action did not go through.',
  'officerPanel.certificateHint':
    'A clearance certificate, completion certificate, ' +
    'or any document closing the file.',

  'completion.submitTitle': 'Forward completion document',
  'completion.submitHelp':
    'Attach the document that completes this letter and send it to the AO, the ' +
    'Secretary, or the Department Head. The letter is only marked completed once ' +
    'they approve it.',
  'completion.approverLabel': 'Send to',
  'completion.chooseApprover': 'Choose an approver',
  'completion.approverAO': 'Administrative Officer',
  'completion.approverSecretary': 'Secretary',
  'completion.approverDepartmentHead': 'Department Head',
  'completion.noteLabel': 'Note (optional)',
  'completion.notePlaceholder': 'What does this document show?',
  'completion.documentLabel': 'Completion document',
  'completion.chooseFile': 'Choose completion document',
  'completion.removeFile': 'Remove document',
  'completion.submit': 'Forward for approval',
  'completion.submitting': 'Forwarding…',
  'completion.submitFailed': 'The completion document could not be forwarded.',
  'completion.approverRequired': 'Choose who should approve this document.',
  'completion.fileRequired': 'Choose a document to attach.',
  'completion.submittedToast': 'Completion document forwarded for approval.',
  'completion.decideTitle': 'Completion document awaiting your decision',
  'completion.submittedBy': 'Submitted by',
  'completion.submittedAt': 'Submitted',
  'completion.decidedBy': 'Decided by',
  'completion.decisionLabel': 'Decision note',
  'completion.decisionPlaceholder': 'A reason, recorded with your decision.',
  'completion.approve': 'Approve & complete',
  'completion.reject': 'Reject',
  'completion.decideFailed': 'The decision could not be saved.',
  'completion.approvedToast': 'Approved. The letter is now completed.',
  'completion.rejectedToast': 'Rejected. The letter is back with the officer.',
  'completion.historyTitle': 'Completion documents',
  'completion.role': 'Approver',
  'completion.open': 'Open',
  'completion.loading': 'Loading…',
  'completion.downloadFailed': 'The document could not be downloaded.',
  'completion.status.Pending': 'Pending',
  'completion.status.Approved': 'Approved',
  'completion.status.Rejected': 'Rejected',

  'registry.exportCsv': 'Export CSV',
  'registry.exportPdf': 'Print / Save as PDF',
  'registry.exporting': 'Preparing…',
  'registry.exportFailed': 'The export could not be prepared.',
  'registry.exportEmpty': 'There is nothing to export for these filters.',
  'registry.exportReady': 'Exported {count} letters.',
  'registry.printTitle': 'Letter Registry',
  'registry.printCount': 'Letters listed',
  'registry.printGenerated': 'Generated {date}',
  'registry.printFilters': 'Filters applied: {summary}',
  'registry.printNoFilters': 'No filters applied — all letters.',
  'registry.receivedFrom': 'Received from',
  'registry.receivedTo': 'Received to',

  'notification.title': 'Notifications',
  'notification.empty': 'No notifications yet.',
  'notification.markAllRead': 'Mark all as read',
  'notification.open': 'View notifications',
  'notification.unread': '{count} unread',
  'notification.openLetter': 'Open letter',

  'notification.assigned.title': 'A letter was assigned to you',
  'notification.assigned.body': '{ref} — {subject}',
  'notification.forwarded_to_ao.title': 'A new letter is waiting in your queue',
  'notification.forwarded_to_ao.body': '{ref} — {subject}',
  'notification.returned.title': 'A letter was returned to your desk',
  'notification.returned.body': '{ref} — {subject}',
  'notification.approval_requested.title': 'A completion document needs your approval',
  'notification.approval_requested.body': '{ref} — {document}',
  'notification.approved.title': 'Your completion document was approved',
  'notification.approved.body': '{ref} — {subject}',
  'notification.rejected.title': 'Your completion document was rejected',
  'notification.rejected.body': '{ref} — {subject}',
  'notification.completed.title': 'A letter you logged was completed',
  'notification.completed.body': '{ref} — {subject}',

  'matcher.title': 'Suggested officer',
  'matcher.scored': '{count} duty rows scored',
  'matcher.loading': 'Scoring the duty charts',
  'matcher.noSuggestion': 'No suggestion yet.',
  'matcher.noSuggestionHint':
    'Open a letter to see the duty matcher\'s answer.',
  'matcher.noMatch': 'No duty chart matches this letter.',
  'matcher.noMatchHint':
    'The matcher scores a letter against duty keywords only. ' +
    'A chart with no keywords can never rank, and a subject with no matching ' +
    'keywords cannot be scored.',
  'matcher.matched': 'Matched: ',
  'matcher.descriptionMatches': 'Also in the duty description: ',
  'matcher.notAssigned':
    'Selected above is not assigned. Press <strong>Assign this letter</strong> to ' +
    'route it, and the letter stays where it is until you do.',
  'matcher.cannotAssign':
    'Your role cannot assign. This list is here so you can see why the letter ' +
    'was routed where it was.',

  'attachment.title': 'Attachments ({count})',
  'attachment.none': 'No scan is attached to this letter.',
  'attachment.preview': 'Preview',
  'attachment.open': 'Open',
  'attachment.add': 'Add files',
  'attachment.helper':
    'Up to 10 at a time. Allowed: pdf, jpg, jpeg, png, tiff, doc, docx.',
  'attachment.uploading': 'Uploading',
  'attachment.progress': '{progress}%',
  'attachment.previewHeading': 'Preview',
  'attachment.close': 'Close',
  'attachment.loading': 'Loading the file',
  'attachment.downloadFailed': 'That file could not be downloaded.',
  'attachment.uploadFailed': 'The file was not attached.',
  'attachment.invalidExtension':
    '"{name}" cannot be attached. Allowed: pdf, jpg, jpeg, png, tiff, doc, docx.',
  'attachment.tooLarge':
    '"{name}" is {size} MB. The limit is {limit} MB.',

  'new.formTitle': 'Log a letter',
  'new.backToRegistry': 'Back to the registry',
  'new.filed': 'Letter filed.',
  'new.dayStampIssued': 'The server issued day stamp {stamp} for this letter.',
  'new.openLetter': 'Open the letter',
  'new.fileAnother': 'File another',
  'new.failed': 'That letter could not be logged.',
  'new.incoming': 'Incoming letter',
  'new.receivedOn': 'Received on',
  'new.senderReference': 'Sender reference',
  'new.referencePlaceholder': 'EDU/2026/TND/0142',
  'new.department': 'Department',
  'new.departmentLabel': 'Department this letter is addressed to',
  'new.departmentLoading': 'Loading departments',
  'new.departmentError': 'Could not load departments — reload the page',
  'new.departmentPlaceholder': 'Select the department',
  'new.departmentHint':
    'Required. The subject clerk of this department sees the letter; ' +
    'other departments do not.',
  'new.senderType': 'Sender type',
  'new.sender': 'Sender',
  'new.senderPlaceholder': 'Department of Provincial Education',
  'new.senderSelect': 'Select the sender',
  'new.senderEmpty': 'No senders yet — add one with +',
  'new.senderError': 'Could not load senders — use + to add one',
  'new.senderHint':
    'Pick the office that sent the letter, or add a new one with +.',
  'new.addSender': 'Add a new sender',
  'new.addSenderTitle': 'Add a sender',
  'new.senderName': 'Sender name',
  'new.senderNamePlaceholder': 'Department of Provincial Education',
  'new.senderTypeHint':
    'Saved with the office, so picking it later fills in both fields.',
  'new.senderSave': 'Add sender',
  'new.senderFailed': 'That sender could not be added.',
  'new.subject': 'Subject',
  'new.subjectPlaceholder':
    'Tender for procurement of laboratory equipment for provincial schools',
  'new.languageHint':
    'Sinhala and Tamil subjects are matched against the duty charts.',
  'new.priority': 'Priority',
  'new.category': 'Category',
  'new.categoryPlaceholder': 'General Administration',
  'new.categoryError': 'The category list could not be loaded.',
  'new.attachment': 'Scan or attachment',
  'new.dropHere': 'Drop the scan here, or choose a file',
  'new.dropHelper':
    'Optional. .pdf, .jpg, .jpeg, .png, .tiff, .doc, .docx — up to 10 MB. ' +
    'The day stamp is issued by the server when the letter is filed.',
  'new.selectedFile': 'Selected: {name}',
  'new.fieldError': 'Field: {field}',
  'new.uploading': 'Uploading the scan',
  'new.uploadProgress': '{progress}%',
  'new.submitting': 'Filing',
  'new.submit': 'File this letter',

  'minutes.formTitle': 'Add minutes and forward',
  'minutes.formHint':
    'Writing minutes is what forwards this letter to the subject clerk. ' +
    'It is one action, not two: the letter cannot be forwarded without an endorsement on it.',
  'minutes.department': 'Department',
  'minutes.departmentLabel': 'Department this letter is routed to',
  'minutes.departmentLoading': 'Loading departments',
  'minutes.departmentError': 'Could not load departments — reload the page',
  'minutes.departmentPlaceholder': 'Choose a department',
  'minutes.keepDepartment': 'Keep the current department',
  'minutes.currentDepartmentHint':
    'This is the department reception filed it under. ' +
    'Change it only if that is wrong — the letter then belongs to the department you pick.',
  'minutes.noDepartmentHint':
    'This letter has no department. Pick one, or no subject clerk will be able to find it.',
  'minutes.instruction': 'Instruction',
  'minutes.endorsement': 'Endorsement',
  'minutes.endorsementPlaceholder':
    'The proposal is noted. The subject matter sits with the District Officer; ' +
    'forwarded to the subject clerk for routing.',
  'minutes.charCount': '{count} characters',
  'minutes.charCountLong':
    '{count} characters — that is long for an endorsement',
  'minutes.recording': 'Recording',
  'minutes.submit': 'Record minutes and forward',
  'minutes.presetImmediate': 'For Immediate Report',
  'minutes.presetDraft': 'Prepare Draft Reply',
  'minutes.presetInformation': 'For Information',
  'minutes.presetAction': 'For Necessary Action',

  'users.title': 'Users',
  'users.search': 'Search',
  'users.searchPlaceholder': 'name or NIC',
  'users.allRoles': 'All roles',
  'users.all': 'All',
  'users.active': 'Active',
  'users.deactivated': 'Deactivated',
  'users.add': 'Add a user',
  'users.addTitle': 'Add a user',
  'users.fullName': 'Full name',
  'users.nic': 'NIC',
  'users.nicHint':
    'Required, and unique across the directory.',
  'users.designation': 'Designation',
  'users.selectDesignation': 'Select a designation',
  'users.noDepartment': 'No department',
  'users.password': 'Password',
  'users.passwordHint':
    'Stored as a bcrypt hash and never returned by any endpoint.',
  'users.noMatches': 'No users match these filters.',
  'users.none': 'No users yet.',
  'users.deactivate': 'Deactivate this user',
  'users.reactivate': 'Reactivate',
  'users.updated': 'User updated.',
  'users.created': 'User created.',
  'users.centralClerk': 'Central intake clerk',
  'users.centralClerkHint':
    'Handles intake for every department: can view, forward and record the AO\'s minutes for letters in any department. Confidential letters stay hidden.',
  'users.deactivatedNotice': '{name} was deactivated.',
  'users.reactivatedNotice': '{name} was reactivated.',
  'users.failed': 'That user could not be saved.',
  'users.addLogin': 'Create login',
  'users.addLoginTitle': 'Create a login',
  'users.addLoginIntro':
    'This creates the sign-in account only. The person\u2019s details are added next, from the "accounts without a profile" list.',
  'users.accountEmailHint':
    'Taken from the login account and fixed once the profile exists.',
  'users.pendingTitle': 'Accounts without a profile ({count})',
  'users.pendingHint':
    'These logins exist but are not yet a person. Select one to add their name, NIC, role and department.',
  'users.pendingFailed': 'The accounts without a profile could not be loaded.',
  'users.completeProfile': 'Complete profile',
  'users.profileTitle': 'Complete the profile for {email}',
  'users.createdAt': 'Created',
  'users.loginCreated':
    'Login created for {email}. Complete the profile below.',
  'users.profileCreated': 'Profile created for {name}.',

  'departments.title': 'Departments',
  'departments.add': 'Add a department',
  'departments.none': 'No departments yet.',
  'departments.name': 'Name',
  'departments.code': 'Code',
  'departments.failed': 'That department could not be saved.',

  'duties.add': 'Add a duty',
  'duties.addToSection': 'Add to this section',
  'duties.section': 'Section',
  'duties.sectionHint':
    'One duty per section per officer. A repeat is refused as a duplicate.',
  'duties.sectionPlaceholder': 'Education — Provincial Schools',
  'duties.description': 'Duty description',
  'duties.descriptionPlaceholder':
    'School administration, teacher matters and examinations',
  'duties.keywords': 'Keywords',
  'duties.noOfficers': 'No officers to chart.',
  'duties.noDuties': 'No duties recorded.',
  'duties.deleteTitle': 'Delete this duty',
  'duties.deleteConfirm': 'Delete permanently',
  'duties.failed': 'That duty could not be saved.',
  'duties.updated': 'Duty updated.',
  'duties.added': 'Duty added.',
  'duties.removed': 'Duty removed.',
  'duties.loadingOfficers': 'Loading officers',
  'duties.loadingChart': 'Loading the duty chart',
  'duties.readOnly':
    'You may read duty charts but not change them. Editing requires the UPDATE_DUTY_CHART permission.',
  'duties.auditNote':
    'Every change to a duty chart is written to the audit log, because these keywords are ' +
    'what the duty matcher scores a letter against.',
  'duties.noDutiesHint': 'Add a section and its keywords. A duty with no keywords can never be ranked.',
  'duties.keywordHint':
    'Enter or comma to add. Sinhala, Tamil and English are all matched — see the ' +
    'Officers & Duties screen for how each is scored.',
  'duties.scoredToo':
    'Scored too, but weakly: a long generic description must not outrank a direct keyword match.',
  'duties.keywordRemove': 'Remove {keyword}',

  'audit.title': 'Audit Log',
  'audit.loading': 'Reading the entry',
  'audit.when': 'When',
  'audit.action': 'Action',
  'audit.by': 'By',
  'audit.fromAddress': 'From address',
  'audit.entity': 'Entity',
  'audit.entityType': 'Entity type',
  'audit.entityId': 'Entity id',
  'audit.idPlaceholder': 'letter or duty id',
  'audit.allActions': 'All actions',
  'audit.noMatches': 'No audit entries match these filters.',
  'audit.noMatchesHint':
    'The log is append-only and never cleaned by the application, ' +
    'so an empty result means the filters are too narrow — widen the date range.',
  'audit.entryTitle': 'Audit entry',
  'audit.whatChanged': 'What changed',
  'audit.noFieldChange': 'This entry recorded no field-level change.',
  'audit.credentialNote':
    'Passwords and tokens are removed before an audit row is written, ' +
    'so a delta can never contain a credential.',
  'audit.failed': 'That audit log could not be loaded.',
  'common.priority': 'Priority',
  'common.category': 'Category',
  'common.date': 'Date',
  'departments.updated': 'Department updated.',
  'departments.added': 'Department added.',
  'common.saving': 'Saving...',
  'duties.keywordPlaceholder': 'Add a keyword and press Enter or comma',
  'users.email': 'Email',
});
