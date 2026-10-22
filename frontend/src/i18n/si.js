/**
 * Sinhala (සිංහල).
 *
 * ============================================================================
 * PROOFREAD BEFORE PRODUCTION
 * ============================================================================
 *
 * These are a DRAFT, written alongside the English rather than translated by a
 * native speaker. They read correctly for standard UI vocabulary — ලිපිය,
 * නිලධාරී, අධිකරණ අංක්පනය and the workflow states all use the terms a ministry
 * would recognise — but before this reaches officers it should be reviewed by a
 * Sinhala speaker, particularly:
 *
 *   - `status.*` and `priority.*`, which are the words that appear on every row
 *     of every table and so are the ones an officer reads most often;
 *   - `admin.*`, where the administrative terms may not match how this ministry
 *     actually names things internally;
 *   - the longer sentences under `officer.*` and `attachement.certificateHint`,
 *     which are the least formulaic and therefore the most likely to read stiffly.
 *
 * The absence of a translation here is not an error: `t()` falls back to English
 * and logs the gap in development, so keys can be filled in over time.
 *
 * ============================================================================
 * PLURALITY IS NOT MODELLED, AND THIS IS A KNOWN OMISSION
 * ============================================================================
 *
 * Sinhala has no grammatical plural, so "1 letter" and "5 letters" are the same
 * noun with a different numeral. English therefore needs a plural form where
 * Sinhala does not — which is why the English dictionary avoids phrase-level
 * plurals ("Showing {from}–{to} of {total}") and carries the count as a numeral
 * instead. Where a count reads awkwardly, the wording below is the one to raise
 * during proofreading.
 */
export const si = Object.freeze({
  // --- Application identity ------------------------------------------------
  'app.ministry': 'ක්‍රීඩා අමාත්‍යාංශය, උව පළාත සභාව',
  'app.title': 'අමාත්‍යංශ කළමණාකරන පද්ධතිය',
  'app.titleDocument': 'EMS — ක්‍රීඩා අමාත්‍යාංශය, උව පළාත සභාව',
  'app.emblem': 'අමාත්‍යාංශ ලාංචනය',

  // --- Language ------------------------------------------------------------
  'lang.toggle': 'භාෂාව වෙනස් කරන්න',
  'lang.current': 'වත්මන් භාෂාව: {language}',
  'lang.switchTo': '{language} දෙන්න මාරු වන්න',

  // --- Navigation ----------------------------------------------------------
  'nav.dashboard': 'කළමනාකරණ පුවරුව',
  'nav.registry': 'ලිපි ලැයිස්තුව',
  'nav.officers': 'නිලධාරීන්',
  'nav.admin': 'පරිපාලනය',
  'nav.vehicles': 'වාහන',
  'nav.transfers': 'කාර්ය ස්ථාන මාරුව',
  'nav.inventory': 'උපකරණ ලැයිස්තුව',
  'nav.modules': 'කොටස්',
  'nav.menu': 'කොටස්',
  'nav.collapse': 'කුඩා කරන්න',
  'nav.expand': 'විස්තර කරන්න',
  'nav.comingLater': 'පසුව එයි',
  'nav.phase': 'අදියර',
  'nav.signOut': 'ඉවත් වන්න',
  'nav.openMenu': 'කොටස් මෙනු විවෘත කරන්න',
  'nav.closeMenu': 'කොටස් මෙනු වසන්න',
  'shell.workspace': 'වැඩ අවකාශය',
  'shell.systemOnline': 'පද්ධතිය සක්‍රීයයි',

  // --- Authentication ------------------------------------------------------
  'auth.signIn': 'පිවිසෙන්න',
  'auth.tagline': 'ඔබගේ ඉමේල් ලිපිනය සහ මුරපදය ඇතුළත් කරමින් ඉදිරියට යන්න.',
  'auth.nic': 'ජාතික හඳුනා අංකය',
  'auth.nicPlaceholder': '881234564V',
  'auth.password': 'මුරපදය',
  'auth.signingIn': 'පිවිසෙමින්...',
  'auth.failed': 'පිවිසුම අසාර්ථක විය.',
  'auth.demoHint': 'ආදර්ශ ගිණුම් README.md හි ඇති බව බලන්න',

  // --- Generic actions and labels -----------------------------------------
  'common.save': 'සුරකින්න',
  'common.cancel': 'අවලංගු කරන්න',
  'common.delete': 'මකන්න',
  'common.edit': 'සංස්කරණය කරන්න',
  'common.add': 'එකතු කරන්න',
  'common.close': 'වසන්න',
  'common.apply': 'යොදන්න',
  'common.clear': 'පැහැදිලි කරන්න',
  'common.search': 'සොයන්න',
  'common.refresh': 'නැවත පෙන්වන්න',
  'common.reload': 'පිටුව නැවත පූරණය කරන්න',
  'common.tryAgain': 'නැවත උත්සාහ කරන්න',
  'common.previous': 'පෙර',
  'common.next': 'ඊළඟ',
  'common.page': 'පිටුව',
  'common.of': '/',
  'common.actions': 'ක්‍රියා',
  'common.all': 'සියල්ල',
  'common.none': 'කිසිවක් නැත',
  'common.yes': 'ඔව්',
  'common.no': 'නැත',
  'common.required': 'අවශ්‍ය',
  'common.optional': 'විකල්ප',
  'common.name': 'නම',
  'common.code': 'කේතය',
  'common.description': 'විස්තරය',
  'common.status': 'තත්ත්වය',
  'common.role': 'භෝජය',
  'common.department': 'අධිකරණ අංක්පනය',
  'common.section': 'අංශය',
  'common.date': 'දිනය',
  'common.from': 'ඉඳහින්',
  'common.to': 'දක්වා',
  'common.total': 'එකතුව',
  'common.loading': 'පූරණය වෙමින්...',
  'common.dismiss': 'වසන්න',
  'common.back': 'ආපසු',
  'common.confirm': 'තහවුරු කරන්න',
  'common.showing': 'මුළු {total} න් {from}–{to} පෙන්වයි',
  'common.noResults': 'පෙන්වීමට යොදන යමක් නොමැත.',
  'common.optionalField': 'අමතර',

  // --- Workflow states -----------------------------------------------------
  'status.Logged': 'ලියා ඇත',
  'status.Forwarded to AO': 'පරිපාලන නිලධාරී වෙත යොමු කරන ලදී',
  'status.Forwarded to Subject': 'විෂයට යොදා ඉදිරිපදීම් කරන ලදී',
  'status.Assigned': 'පත් කරන ලදී',
  'status.In Progress': 'ක්‍රියාවලියේ පවතී',
  'status.Pending Approval': 'අනුමැතිය අපේක්ෂිතයි',
  'status.Completed': 'සම්පූර්ණ කරන ලදී',
  'status.unknown': 'හඳුනාගත නොහැකි තත්ත්වයකි: {status}',
  'status.railLabel': 'ක්‍රියාවලි ක්‍රියාවලියේ තත්ත්වය',
  'status.railMinutes': 'විනිසුරුගේ සටහන — මෙය ලිපිය ඉදිරිපදුනේ අනුමැතිකමයි',

  // --- Priorities ----------------------------------------------------------
  'priority.Normal': 'සාමාන්‍ය',
  'priority.Urgent': 'හදිසි',
  'priority.Confidential': 'රහස්‍ය',
  'priority.unknown': 'හඳුනාගත නොහැකි ප්‍රමුඛත්වයකි: {priority}',

  // --- Role badges ---------------------------------------------------------
  'role.MINOR_STAFF': 'කුඩා පාලක කාර්යකරු',
  'role.SECRETARY': 'ලිපිපති',
  'role.AO': 'පරිපාලන නිළධාරී',
  'role.CHIEF_CLERK': 'ප්‍රධාන ලේඛකයා',
  'role.SUBJECT_CLERK': 'විෂය ලේඛකයා',
  'role.DEPARTMENT_HEAD': 'දෙපාර්තමේන්තු ප්‍රධානි',
  'role.OFFICER': 'නිලධාරී',
  'role.TRANSPORT_OFFICER': 'ප්‍රවාහන නිලධාරී',
  'role.ADMIN': 'පරිපාලකයා',

  // --- Dashboard -----------------------------------------------------------
  'dashboard.title': 'කළමනාකරණ පුවරුව',
  'dashboard.byState': 'ක්‍රියාවලි තත්ත්වය අනුව',
  'dashboard.byPriority': 'ප්‍රමුඛත්වය අනුව',
  'dashboard.bySenderType': 'එවන්නාගේ වර්ගය අනුව',
  'dashboard.intake': 'පිවිසුම්, පසු දින 30',
  'dashboard.latestLetters': 'නවතම ලිපි',
  'dashboard.openRegistry': 'ලැයිස්තුව විවෘත කරන්න',
  'dashboard.noLetters': 'තවම ලිපි නොමැත.',
  'dashboard.nothingWaiting': 'ඔබ බලාපොරොත්තු වන කිසිවක් නොමැත.',
  'dashboard.waitingForYou': 'ඔබ බලාපොරොත්තු වෙන්නේ',

  // --- Letter registry -----------------------------------------------------
  'registry.title': 'ලිපි ලැයිස්තුව',
  'registry.logLetter': 'ලිපියක් ඇතුළත් කරන්න',
  'registry.allStates': 'සියලු තත්ත්වයයන්',
  'registry.allPriorities': 'සියලු ප්‍රමුඛත්ව',
  'registry.allSenders': 'සියලු එවන්නා',
  'registry.filters': 'පෙරහස්',
  'registry.clearFilters': 'පෙරහස් පැහැදිලි කරන්න, හෝ නව ලිපියක් ඇතුළත් කරමින් ගොනුවක් ආරම්භ කරන්න.',
  'registry.noMatches': 'මෙම පෙරහස් වලට ගැලපෙන ලිපියක් නොමැත.',
  'registry.searchPlaceholder': 'යොමු, මාතෘකාව හෝ එවන්නා ගැනහොම් නොයන්න',

  // --- Letter detail -------------------------------------------------------
  'mail.title': 'ලිපිය',
  'mail.dayStamp': 'දින මුදුන',
  'mail.reference': 'යොමු',
  'mail.subject': 'මාතෘකාව',
  'mail.sender': 'එවන්නා',
  'mail.senderType': 'එවන්නාගේ වර්ගය',
  'mail.received': 'ලැබුණු දිනය',
  'mail.category': 'කාණ්ඩය',
  'mail.officer': 'නිලධාරී',
  'mail.assignedOfficer': 'පත් කළ නිලධාරී',
  'mail.notYetAssigned': 'තවම පත් කර නොමැත',
  'mail.assignedOn': 'පත් කළ දිනය',
  'mail.completedOn': 'සම්පූර්ණ කළ දිනය',
  'mail.officerNote': 'මාරු කිරීමේ සටහන',
  'mail.hasAttachment': 'ස්කෑනයක් ඇතුළත්ය',
  'mail.noAttachment': 'ස්කෑනයක් ඇතුළත් නොවේ',
  'mail.openLetter': 'ලිපිය විවෘත කරන්න',
  'mail.backToRegistry': '← ලිපි ලැයිස්තුවට ආපසු',
  'mail.couldNotOpen': 'එම ලිපිය විවෘත කළ නොහැකි විය.',
  'mail.unassigned': 'පත් කර නොමැත',

  // --- Minutes and activity ------------------------------------------------
  'minutes.title': 'විනිසුරුගේ සටහන් සහ ක්‍රියාකාරිත්වය',
  'minutes.add': 'විනිසිට එකතු කර ඉදිරිපදීම් කරන්න',
  'minutes.instruction': 'උපදෙස',
  'minutes.endorsement': 'අනුමැතිකම',
  'minutes.instructionType': 'උපදෙස් වර්ගය',
  'minutes.endorsementPlaceholder':
    'යෝජනාව සලකා බලා ඇත. මාතෘකාව අදාල විෂය පළාත් නිලධාරීගේ අත යටතේ ය; යොමු කිරීමට විෂය ලේඛකයාට ඉදිරිපදීම් කරන ලදී.',
  'minutes.activity': 'ක්‍රියාකාරිත්වය',
  'minutes.noneYet': 'තවම විනිසිට නොමැත.',
  'minutes.noActivity': 'සටහන් කළ ක්‍රියාකාරිත්වයක් නොමැත.',
  'minutes.forwardExplained':
    'විෂයට යොදා ඉදිරිපදීම් කරන ලද්දේ නිලධාරියකුගේ අනුමැතිකම ලියන විටය.',
  'minutes.print': 'විනිසිට පත්‍රය මුද්‍රා කරන්න',
  'minutes.slipTitle': 'විනිසිට පත්‍රය',
  'minutes.noEndorsement': 'මෙම ලිපියට අදාල අනුමැතිකමක් තවම සටහන් කර නොමැත.',

  // --- Attachments ---------------------------------------------------------
  'attachment.title': 'ඇමුණුම්',
  'attachment.none': 'මෙම ලිපියට පරිපූර්ණ පිටපතයක් ඇතුළත් කර නොමැත.',
  'attachment.preview': 'පෙරදැක්වීම',
  'attachment.open': 'විවෘත කරන්න',
  'attachment.add': 'ගොනු එකතු කරන්න',
  'attachment.uploading': 'උඩුගත කරමින්...',
  'attachment.download': 'බාගන්න',
  'attachment.certificateHint':
    'නිදහස් කිරීමේ සහතිය, සම්පූර්ණ කිරීමේ සහතිය, හෝ ගොනුව වසන ඕනෑම ලේඛනයක්.',
  'attachment.closedNotice': 'මෙම ලිපිය වසා ඇත. ඇමුණුම් තවදුරටත් එකතු කළ නොහැක.',

  // --- Officer progress and completion -------------------------------------
  'officer.progress': 'ප්‍රගතිය',
  'officer.progressNote': 'ප්‍රගති සටහන',
  'officer.notePlaceholder': 'ඔක්තෝබර් 3 හි පරීක්ෂණය; මිල ගණන් ඉදිරිපදීම් කරමින් පවතී.',
  'officer.saveNote': 'සටහන සුරකින්න',
  'officer.yourActions': 'ඔබගේ ක්‍රියාවලිය',
  'officer.startHelp':
    'ආරම්භ කිරීම මෙම ලිපිය ක්‍රියාත්මක තත්ත්වයට මාරු කර ඔබගේ නම සමඟ ආරම්භය සටහන් කරයි.',
  'officer.completeHelp': 'සම්පූර්ණ කිරීම ගොනුව වසයි. සම්පූර්ණ කිරීමේ දිනය ස්වයංක්‍රීයව ලියනු ලැබේ.',
  'officer.closed': 'මෙම ලිපිය වසා ඇත. ඇමුණුම් තවදුරටත් එකතු කළ නොහැක.',
  'officer.otherRole': 'ඊළඟ පියවර ක්‍රියාවලියේ වෙනත් භෝජයකට යැවීමකි.',
  'officer.refreshLetter': 'මෙම ලිපිය නැවත පූරණය කරන්න',
  'officer.actionFailed': 'එම ක්‍රියාව සිදු කිරීමට නොහැකි විය.',
  'officer.notes': 'සටහන්',

  // --- Assignment ----------------------------------------------------------
  'assign.title': 'නිලධාරී පත් කරන්න',
  'assign.why': 'මෙම නිලධාරීව තෝරාගන්නේ ඇයි සහ එය ගැන බලාපොරොත්තුවෙන් තියෙන්නේ කුමන ක්‍රියාවලියක්ද',
  'assign.suggested': 'යෝග්‍ය නිලධාරී',
  'assign.noSuggestion': 'තවම යෝග්‍යතාවයක් නොමැත.',
  'assign.noMatch': 'මෙම ලිපියට ගැලපෙන කාර්ය චතිත්‍රයක් නොමැත.',
  'assign.notAssignedWarning': 'ඉහත තෝරාගත් කෙනෙකුට ලිපිය පත් කර නොමැත. ඔබට ඕනෑම කෙනෙකුට පත් කළ හැක.',
  'assign.thisLetter': 'මෙම ලිපිය පත් කරන්න',
  'assign.assigned': '{name} ට පත් කරන ලදී.',
  'assign.failed': 'එම ලිපිය පත් කළ නොහැකි විය.',
  'assign.select': 'නිලධාරී කෙනෙකු තෝරන්න',

  // --- Officers and duty charts --------------------------------------------
  'officers.title': 'නිලධාරීන්',
  'officer.none': 'ක්‍රියාත්මක නිලධාරීන් නොමැත.',
  'officer.noDuties': 'කාර්ය සටහන් කර නොමැත.',
  'officer.noDutyRows': 'මෙම නිලධාරීගේ කාර්ය පේළි නොමැති නිසා ගැලපිය නොහැක.',
  'officer.duties': 'කාර්ය',
  'officer.dutyChart': 'කාර්ය සටහන',

  // --- Logging a new letter ------------------------------------------------
  'new.title': 'ලිපියක් ඇතුළත් කරන්න',
  'new.backToRegistry': 'ලැයිස්තුවට ආපසු',
  'new.incoming': 'එන ලිපිය',
  'new.receivedOn': 'ලැබුණු දිනය',
  'new.senderReference': 'එවන්නාගේ යොමු',
  'new.senderType': 'එවන්නාගේ වර්ගය',
  'new.sender': 'එවන්නා',
  'new.senderPlaceholder': 'අධ්‍යාපන අමාත්‍යාංශය',
  'new.subject': 'මාතෘකාව',
  'new.subjectPlaceholder': 'පළාත් පාසල් සඳහා පර්යාජ උපකරණ නිකුත් කිරීමේ ටෙන්ඩරය',
  'new.referencePlaceholder': 'EDU/2026/TND/0142',
  'new.priority': 'ප්‍රමුඛත්වය',
  'new.category': 'කාණ්ඩය',
  'new.categoryPlaceholder': 'සාමාන්‍ය පරිපාලනය',
  'new.categoryError': 'කාණ්ඩ ලැයිස්තුව පූරණය කළ නොහැකි විය.',
  'new.attachment': 'ස්කෑනය හෝ ඇමුණුම',
  'new.dropHere': 'ස්කෑනය මෙහි දමන්න, හෝ ගොනුවක් තෝරන්න',
  'new.languageHint': 'සිංහල සහ දෙමළ මාතෘකා කාර්ය සටහන සමඟ ගැලපීමට යොදනු ලැබේ.',
  'new.filed': 'ලිපිය ඇතුළත් කරන ලදී.',
  'new.openLetter': 'ලිපිය විවෘත කරන්න',
  'new.fileAnother': 'තවත් ලිපියක් ලොග් කරන්න',
  'new.failed': 'එම ලිපිය ඇතුළත් කළ නොහැකි විය.',

  // --- Administration ------------------------------------------------------
  'admin.title': 'පරිපාලනය',
  'admin.sections': 'පරිපාලන කොටස්',
  'admin.subtitle': '{role} ලෙස පිවිසී ඇත ({name}). පරිපාලකයාගේ භෝජයෙන් පිටත කාර්ය සටහන පමණක් සංස්කරණය කළ හැකිය.',
  'admin.noTabs': 'ඔබගේ භෝජයට ලබාගත හැකි පරිපාලන පටුවක් නොමැත.',
  'admin.tabUsers': 'පරිශීලකයින්',
  'admin.tabDepartments': 'ප්‍රදේශ අධිකරණ',
  'admin.tabDuties': 'කාර්ය සටහන',
  'admin.tabSettings': 'සැකසුම්',
  'admin.tabAudit': 'විශ්ලේෂණ ලැයිස්තුව',

  'admin.users.title': 'පරිශීලකයින්',
  'admin.users.search': 'සොයන්න',
  'admin.users.searchPlaceholder': 'නම හෝ ජාතික හඳුනා අංකය',
  'admin.users.allRoles': 'සියලු භෝජ',
  'admin.users.all': 'සියල්ල',
  'admin.users.active': 'ක්‍රියාත්මක',
  'admin.users.deactivated': 'අක්‍රිය',
  'admin.users.add': 'පරිශීලක කෙනෙකු එකතු කරන්න',
  'admin.users.addTitle': 'පරිශීලක කෙනෙකු එකතු කරන්න',
  'admin.users.fullName': 'සම්පූර්ණ නම',
  'admin.users.nic': 'ජාතික හඳුනා අංකය',
  'admin.users.email': 'විද්‍යුත් තැපෑල',
  'admin.users.nicHint': 'අවශ්‍ය වන අතර, නාමිකා තනතුර අතර අද්වගත විය යුතුය.',
  'admin.users.designation': 'තනතුර',
  'admin.users.noDepartment': 'ප්‍රදේශ අධිකරණයක් නොමැත',
  'admin.users.password': 'මුරපදය',
  'admin.users.passwordHint': 'bcrypt හැෂ් ලෙස ගබඩා කරන අතර, කිසිදු API ප්‍රතිථලනයකින් නොපෙන්වනු ලැබේ.',
  'admin.users.noMatches': 'මෙම පෙරහස් වලට ගැලපෙන පරිශීලකයෙකු නොමැත.',
  'admin.users.deactivate': 'මෙම පරිශීලකයා අක්‍රිය කරන්න',
  'admin.users.failed': 'එම පරිශීලකයා සුරක්ෂිත කළ නොහැකි විය.',

  'admin.departments.title': 'ප්‍රදේශ අධිකරණ',
  'admin.departments.add': 'ප්‍රදේශ අධිකරණයක් එකතු කරන්න',
  'admin.departments.none': 'තවම ප්‍රදේශ අධිකරණ නොමැත.',
  'admin.departments.name': 'නම',
  'admin.departments.code': 'කේතය',
  'admin.departments.failed': 'එම ප්‍රදේශ අධිකරණය සුරක්ෂිත කළ නොහැකි විය.',

  'admin.settings.intro':
    'ලිපියක් ඇතුළත් කළ හැකි කාණ්ඩ, එක් එක් කාණ්ඩයට අවශ්‍ය ක්‍රියාව සහ එය සම්පූර්ණ කිරීමට උපරිම දින සංඛ්‍යාව නිර්වචනය කරන්න.',
  'admin.settings.count': 'කාණ්ඩ {count} ක්.',
  'admin.settings.add': 'කාණ්ඩයක් එකතු කරන්න',
  'admin.settings.none': 'තවම ලිපි කාණ්ඩ නොමැත.',
  'admin.settings.name': 'කාණ්ඩ නම',
  'admin.settings.namePlaceholder': 'ව්‍යාපෘති වාර්තාව',
  'admin.settings.nameHint': 'අද්විතීය. ඇතුළත් කිරීමේ පෝරමය පෙන්වන්නේ එයයි; ලිපිය ගබඩා කරන්නේ එයයි.',
  'admin.settings.action': 'ගත යුතු ක්‍රියාව',
  'admin.settings.actionPlaceholder': 'ව්‍යාපෘති වාර්තාව සකස් කරන්න',
  'admin.settings.actionHint': 'මෙම වර්ගයේ ලිපියක් සඳහා පත් කළ නිලධාරියා කළ යුත්තේ කුමක්ද.',
  'admin.settings.maxDays': 'සම්පූර්ණ කිරීමට උපරිම දින',
  'admin.settings.maxDaysPlaceholder': '30',
  'admin.settings.maxDaysHint': 'අවසන් ක්‍රියාව ගත හැකි අවසන් දිනය. සීමාවක් නොමැති නම් හිස් තබන්න.',
  'admin.settings.days': 'දින',
  'admin.settings.added': 'කාණ්ඩය එකතු කරන ලදී.',
  'admin.settings.updated': 'කාණ්ඩය යාවත්කාලීන කරන ලදී.',
  'admin.settings.deleted': 'කාණ්ඩය මකන ලදී.',
  'admin.settings.deleteTitle': 'මෙම කාණ්ඩය මකන්න',
  'admin.settings.deleteMessage':
    '"{name}" මකන්නද? එය යටතේ දැනටමත් ඇතුළත් කළ ලිපි ඔවුන්ගේ කාණ්ඩ පෙළ රඳවා ගනී; ලැයිස්තුවේ ඇතුළත් කිරීම පමණක් ඉවත් වේ.',
  'admin.settings.failed': 'එම කාණ්ඩය සුරක්ෂිත කළ නොහැකි විය.',
  'admin.settings.loadFailed': 'කාණ්ඩ පූරණය කළ නොහැකි විය.',

  'admin.duties.add': 'කාර්යයක් එකතු කරන්න',
  'admin.duties.addToSection': 'මෙම අංශයට එකතු කරන්න',
  'admin.duties.section': 'අංශය',
  'admin.duties.sectionHint': 'එක් නිලධාරියකට එක් අංශයකට එක් කාර්යයක් පමණයි. නැවත ඇතුළත් කිරීම අනුපිටපත ලෙස ප්‍රතික්ෂේප කරනු ලැබේ.',
  'admin.duties.sectionPlaceholder': 'අධ්‍යාපනය — පළාත් පාසල්',
  'admin.duties.description': 'කාර්ය විස්තරය',
  'admin.duties.descriptionPlaceholder': 'පාසල් පරිපාලනය, ගුරුවරුන්ගේ කරුණාංග යා පරීක්ෂණ',
  'admin.duties.keywords': 'මුල් පද',
  'admin.duties.noOfficers': 'චතිත්‍රය සකස් කිරීමට නිලධාරීන් නොමැත.',
  'admin.duties.noDuties': 'කාර්ය සටහන් කර නොමැත.',
  'admin.duties.deleteTitle': 'මෙම කාර්යය මකන්න',
  'admin.duties.failed': 'එම කාර්යය සුරක්ෂිත කළ නොහැකි විය.',

  'admin.audit.title': 'විශ්ලේෂණ ලැයිස්තුව',
  'admin.audit.whatChanged': 'වෙනස් වූ දේ',
  'admin.audit.action': 'ක්‍රියාව',
  'admin.audit.allActions': 'සියලු ක්‍රියා',
  'admin.audit.entityType': 'නිරූපණ කාණ්ඩය',
  'admin.audit.entityId': 'නිරූපණ අංකය',
  'admin.audit.idPlaceholder': 'ලිපි හෝ කාර්ය අංකය',
  'admin.audit.noMatches': 'මෙම පෙරහස් වලට ගැලපෙන විශ්ලේෂණ ඇතුළතු නොමැත.',
  'admin.audit.entryTitle': 'විශ්ලේෂණ ඇතුළතුව',
  'admin.audit.noFieldChange': 'මෙම ඇතුළතුවෙන් ක්ෂේත්‍ර මට්ටම වෙනසක් සටහන් කර නොමැත.',
  'admin.audit.failed': 'එම විශ්ලේෂණ ලැයිස්තුව පෙන්වීමට නොහැකි විය.',

  // --- Access refusals -----------------------------------------------------
  'forbidden.title': 'අවසර නොමැත',
  'forbidden.body': 'ඔබට මෙම ප්‍රදේශයට ප්‍රවේශය නොමැත.',
  'forbidden.requires': 'මෙම ප්‍රදේශයට {kind} {value} අවශ්‍යයි.',
  'forbidden.kindRole': 'භෝජයක්',
  'forbidden.kindPermission': 'අවසරයක්',
  'forbidden.goToRegistry': 'ලිපි ලැයිස්තුවට යන්න',
  'forbidden.goToDashboard': 'කළමනාකරණ පුවරුවට යන්න',

  'notFound.title': 'පිටුව හමු නොවීය',
  'notFound.body': 'එම පිටුව නොපවතී. ඉදිරියට යාමට පිවිසෙන්න.',

  // --- Failures ------------------------------------------------------------
  'error.pageBroken': 'මෙම පිටුව පෙන්වීමට නොහැකි විය',
  'error.pageBrokenBody':
    'පද්ධතියේ ඉතිරි කොටස් තවම භාවිත කළ හැකිය — වම් පැත්තේ ඇති මෙනුව තවම ක්‍රියා කරයි. මෙය නැවත නැවත සිදු වුවොත් ඉහත පණිවිඩය සහායට එවන්න.',
  'error.generic': 'අනපේක්ෂිත දෝෂයක් සිදු විය.',
  'error.network': 'සේවාදායකයෙන් බැඳීම් නොහැකි විය.',
  'error.forbidden': 'ඔබට එම දේ කිරීමට අවසර නොමැත.',
  'error.notFound': 'එම වාර්තාව නොපවතී, හෝ ඔබට එය පෙන්වීමට නොහැකි විය.',
  'error.conflict': 'වෙනත් අය පළමුව මෙය වෙනස් කළ ඇත. නැවත පූරණය කරමින් නැවත උත්සාහ කරන්න.',

  'session.restoring': 'සැසිය ප්‍රතිස්ථාපනය වෙමින්...',

  'login.title': 'පිවිසෙන්න',
  'login.ministry': 'ක්‍රීඩා අමාත්‍යාංශය, උව පළාත',
  'login.systemName': 'ව්‍යාපාර කළමනාකරණ පද්ධතිය',
  'login.tagline': 'ඔබගේ ජාතික හඳුනා අංකය සහ මුරපදය ඇතුළත් කරමින් ඉදිරියට යන්න.',
  'login.nic': 'ජාතික හඳුනා අංකය',
  'login.nicPlaceholder': '881234564V',
  'login.password': 'මුරපදය',
  'login.showPassword': 'මුරපදය පෙන්වන්න',
  'login.hidePassword': 'මුරපදය සඟවන්න',
  'login.signingIn': 'පිවිසෙමින්',
  'login.submit': 'පිවිසෙන්න',
  'login.demoHint':
    'ආදර්ශ ගිණුම් සඳහා ලියාපදිංචි කරන ලද ගිණුම් ප්‍රකාශයට ලියාපදිංචි කර ඇත. ' +
    'මුරපදය: PmeDemo@2026. මෙම ආදර්ශයෙන් පිට භාවිත නොකරන්න.',

  'forbidden.title': 'අවසර නොමැත',
  'forbidden.body': 'ඔබගේ භෝජය මෙම පිටුව ලබාගත නොහැක.',
  'forbidden.requires': 'මෙම ප්‍රදේශයට {kind} {value} අවශ්‍යයි.',
  'forbidden.kindRole': 'භෝජයක්',
  'forbidden.kindPermission': 'අවසරයක්',
  'forbidden.goToRegistry': 'ලිපි ලැයිස්තුවට යන්න',
  'forbidden.goToDashboard': 'කළමනාකරණ පුවරුව',
  'forbidden.footer':
    'මෙය ඔබට ලැබිය යුතුයැයි සිතන්නේ නම්, පරිපාලකයෙකුට එය ලබාදිය හැක. ' +
    'විශ්ලේෂණ ලැයිස්තුව මෙම උත්සාහය ලියා ඇත.',

  'notFound.title': 'පිටුව හමු නොවීය',
  'notFound.body': 'එම පිටුව නොපවතී. ඉදිරියට යාමට පිවිසෙන්න.',
  'notFound.signIn': 'පිවිසෙන්න',
  'notFound.dashboard': 'කළමනාකරණ පුවරුව',
  'notFound.registry': 'ලිපි ලැයිස්තුව',
  'notFound.nothingAt': '{pathname} හි යමක් නොපවතී.',

  'dashboard.loadingRegistry': 'ලිපි ලැයිස්තුව පූරණය වෙමින්',
  'dashboard.loadingQueue': 'ඔබගේ පෝෂ්ඨ පෙළ පූරණය වෙමින්',
  'dashboard.ministryTitle': 'කළමනාකරණ පුවරුව',
  'dashboard.byState': 'ක්‍රියාවලි තත්ත්වය අනුව',
  'dashboard.byStateHint':
    'ගොනු වත්මන් තත්ත්වයේ පිහිටියේ කොතැනද — එය ලැයිස්තුවට තෝරන්න.',
  'dashboard.byPriority': 'ප්‍රමුඛත්වය අනුව',
  'dashboard.byPriorityHint': 'ප්‍රමුඛත්වයක් තෝරා එය ලැයිස්තුවට බලන්න.',
  'dashboard.bySenderType': 'එවන්නාගේ වර්ගය අනුව',
  'dashboard.bySenderTypeHint': 'මඳ්දෙනේ මුල් ලිපි ලබාගන්නේ කවුද නිසා.',
  'dashboard.latestLetters': 'නවතම ලිපි',
  'dashboard.latestHint': 'මෑතදී ලැබුණු ලිපි හ' ,
  'dashboard.openRegistry': 'ලැයිස්තුව විවෘත කරන්න',
  'dashboard.noLetters': 'තවම ලිපි නොමැත.',
  'dashboard.lettersOnRecord': 'ලියාපදිංචි ලිපි',
  'dashboard.lettersOnRecordHint': 'සියලු ලිපි බලන්න',
  'dashboard.open': 'විවෘත',
  'dashboard.openHint': 'තවම ක්‍රියාත්මකයි',
  'dashboard.completed': 'සම්පූර්ණ',
  'dashboard.completedHint': 'වසා ගොනු කර ඇත',
  'dashboard.overdue': 'කාලය ඉක්මවූ',
  'dashboard.overdueHint': 'දින 30 පමණ විවෘතව ඇත',
  'dashboard.waitingForYou': 'ඔබට විවෘත ලිපි ({count})',
  'dashboard.nothingWaiting': 'ඔබ බලාපොරොත්තු වන කිසිවක් නොමැත.',
  'dashboard.queueEmpty':
    '{name} ට යොදා ඇති ලිපි මෙහි දිස් වෙනු ඇත.',
  'dashboard.drilldownState': '"{state}" තත්ත්වයේ ලිපි',
  'dashboard.drilldownPriority': '{priority} ලිපි',
  'dashboard.drilldownSender': '{senderType} නිසා ලැබුණු ලිපි',
  'dashboard.drilldownShortfall':
    ' ටයිලය {figureCount} කියා තියෙනවා, එය මුළු ලිපි ගණනය; ' +
    'මෙම ලැයිස්තුව ඔබගේ භෝජයට ලැබිය හැකි ලිපියි.',
  'dashboard.drilldownCount':
    'මුළු {count} ලිපි අතරින් නවතම {shown} පෙන්වයි. ඉතිරි ලිපි ලැයිස්තුවේ පෙන්වයි.',
  'dashboard.drilldownNoLetters': 'මෙම ගණනයට ගැලපෙන ලිපියක් නොමැත.',
  'dashboard.drilldownOpenRegistry': 'ලැයිස්තුවේ විවෘත කරන්න',
  'dashboard.drilldownClose': 'වසන්න',
  'dashboard.drilldownLoading': 'ලිපි පූරණය වෙමින්',

  'admin.title': 'පරිපාලනය',
  'admin.subtitle':
    '{name} ({role}) ලෙස පිවිසී ඇත. පරිපාලකයාගේ භෝජයෙන් පිටත කාර්ය සටහන පමණක් සංස්කරණය කළ හැකිය.',
  'admin.sections': 'පරිපාලන කොටස්',
  'admin.noTabs': 'ඔබගේ භෝජයට ලබාගත හැකි පරිපාලන පටුවක් නොමැත.',
  'admin.tabUsers': 'පරිශීලකයින්',
  'admin.tabDepartments': 'ප්‍රදේශ අධිකරණ',
  'admin.tabDuties': 'කාර්ය සටහන',
  'admin.tabSettings': 'සැකසුම්',
  'admin.tabAudit': 'විශ්ලේෂණ ලැයිස්තුව',

  'officers.pageTitle': 'නිලධාරීන් හා කාර්ය සටහන්',
  'officers.pageDescription':
    'පහත රූපවත් කිරීම් යනු කාර්ය ගැලපුම් මැචර් මෙම ලිපියේ මාතෘකාවට ' +
    'ලක්ෂණ දැක්වීමට ලක් කරන දේ සිංහල, දෙමළ හා ඉංග්‍රීසි භාෂා වලින්ය. ' +
    'නිලධාරීයකුට කොටස් කිහිපයක බලාපොරොත්තුවක් ඇති විය හැක; ' +
    'පේළි පෙන්වන්නේ එක් එක් අවස්ථා සඳහාය.',
  'officers.title': 'නිලධාරීන්',
  'officers.none': 'ක්‍රියාත්මක නිලධාරීන් නොමැත.',
  'officers.loadingChart': 'කාර්ය සටහන පූරණය වෙමින්',
  'officers.noDuties': 'කාර්ය සටහන් කර නොමැත.',
  'officers.noDutyRows':
    'මෙම නිලධාරීගේ කාර්ය පේළි නොමැති නිසා ගැලපිය නොහැක.',
  'officers.dutyChart': 'කාර්ය සටහන',
  'officers.chartTitle': 'කාර්ය සටහන — {name}',
  'officers.homeSection': 'මුල් අංශය:',
  'officers.homeSectionMissing': 'ලියා නැත',
  'officers.sectionsCount': 'අංශ {sections} ක තුන් කාර්ය {count}.',

  'mail.backToRegistry': '← ලිපි ලැයිස්තුවට ආපසු',
  'mail.title': 'ලිපිය',
  'mail.opening': 'ලිපිය විවෘත කරමින්',
  'mail.receivedOn': 'ලැබුණු දිනය',
  'mail.senderReference': 'එවන්නාගේ යොමු',
  'mail.senderType': 'එවන්නාගේ වර්ගය',
  'mail.sender': 'එවන්නා',
  'mail.category': 'කාණ්ඩය',
  'mail.loggedBy': 'ලියා ඇති කරු',
  'mail.registry': 'ලැයිස්තුව',
  'mail.assignedOfficer': 'පත් කළ නිලධාරී',
  'mail.notYetAssigned': 'තවම පත් කර නොමැත',
  'mail.assignedOn': 'පත් කළ දිනය',
  'mail.completedOn': 'සම්පූර්ණ කළ දිනය',
  'mail.categoryAction': 'ගත යුතු ක්‍රියාව',
  'mail.categoryDue': 'සම්පූර්ණ කළයුතු දිනය',
  'mail.categoryDueValue': 'දින {days} ක් ඇතුළත් — {date} වන විට',
  'mail.categoryMaxDaysOnly': 'දින {days} ක් ඇතුළත්',

  'clock.title': 'සම්පූර්ණ කිරීමට ඇති කාලය',
  'clock.statusOverdue': 'කල් ඉකුත්',
  'clock.statusDueSoon': 'ඉක්මනින් අවසන් වේ',
  'clock.statusOnTrack': 'නියමිත පරිදි',
  'clock.days': 'දින',
  'clock.hours': 'පැය',
  'clock.minutes': 'මිනිත්තු',
  'clock.seconds': 'තත්පර',
  'clock.dayLeft': 'දින {days} ක් ඉතිරියි',
  'clock.daysLeft': 'දින {days} ක් ඉතිරියි',
  'clock.dayOverdue': 'දින {days} ක් කල් ඉකුත්',
  'clock.daysOverdue': 'දින {days} ක් කල් ඉකුත්',
  'clock.allowed': 'අවසර දින {days}',
  'clock.due': '{date} වන විට',

  'minutes.title': 'විනිසුරුගේ සටහන් සහ ක්‍රියාකාරිත්වය',
  'minutes.activity': 'ක්‍රියාකාරිත්වය',
  'minutes.noneYet': 'තවම විනිසුරුගේ සටහනක් නැත.',
  'minutes.noActivity': 'සටහන් කළ ක්‍රියාකාරිත්වයක් නොමැත.',

  'notes.title': 'සටහන්',
  'notes.subjectClerk': 'විෂය ලේඛක',
  'notes.officer': 'නිලධාරී',
  'notes.subjectClerkLabel': 'විෂය ලේඛකගේ සටහන',
  'notes.officerLabel': 'නිලධාරීගේ ප්‍රගති සටහන',
  'notes.clerkHint':
    'වර්ගීකරණය හා යොමු කිරීම — මෙම ලිපිය ඇයි එම ස්ථානයට යොදා ඇති ද.',
  'notes.officerHint': 'කළ දේ හා ඉතිරිව ඇති දේ.',
  'notes.saving': 'සුරකිමින්',
  'notes.save': 'සටහන සුරකින්න',
  'notes.saved': 'සටහන සුරකින ලදී.',
  'notes.saveFailed': 'සටහන සුරකින්නට නොහැකි විය.',

  'assign.title': 'නිලධාරීව හෝ ශාඛා විෂය ලේඛකයාව පත් කරන්න',
  'assign.officerLabel': 'නිලධාරී හෝ ශාඛා විෂය ලේඛකයා',
  'assign.choose': 'නිලධාරීව හෝ ශාඛා විෂය ලේඛකයාව තෝරන්න',
  'assign.officersGroup': 'නිලධාරීන්',
  'assign.clerksGroup': 'ශාඛා විෂය ලේඛකයින්',
  'assign.routingNote': 'මාරු කිරීමේ සටහන',
  'assign.routingHint': 'මෙම නිලධාරීව හෝ ලේඛකයාව තෝරාගන්නේ ඇයි සහ එය ගැන බලාපොරොත්තුවෙන් තියෙන්නේ කුමන ක්‍රියාවලියක්ද.',
  'assign.submit': 'මෙම ලිපිය පත් කරන්න',
  'assign.submitting': 'පත් කරමින්',
  'assign.failed': 'එම ලිපිය පත් කළ නොහැකි විය.',
  'assign.assigned': '{name} ට පත් කරන ලදී.',
  'assign.routedToClerk': 'ශාඛා විෂය ලේඛක {name} වෙත යොමු කරන ලදී.',
  'assign.clerkAsExecutor':
    'මෙම ලේඛකයා ක්‍රියාත්මක කරන්නා ලෙස පත් කරන්න — ඔවුන් ලිපිය වෙත යොමු නොකර, ඔවුන්ම සකසයි.',
  'assign.toSelf': 'මෙම ලිපිය මටම පත් කරන්න',
  'assign.toSelfHint':
    'ලිපිය ඔබම සකසන්න: ඔබ එය ආරම්භ කර, ප්‍රගති සටහන යොදා, සම්පූර්ණ කිරීමේ වාර්තාව ඔබම ඉදිරිපත් කරයි.',
  'assign.selfAssigned': 'ලිපිය දැන් ඔබට පත් කර ඇත.',

  'nextStep.title': 'ඊළඟ පියවර',
  'nextStep.closed': 'මෙම ලිපිය වසා ඇත. ගොනුව සම්පූර්ණයි.',
  'nextStep.otherRole':
    'ඊළඟ පියවර ක්‍රියාවලියේ වෙනත් භෝජයකට යැවීමකි.',

  'forward.title': 'පරිපාලන නිලධාරී වෙත යවන්න',
  'forward.help':
    'ප්‍රධාන විනිස පිණිස ලිපිය පරිපාලන නිලධාරී (AO) වෙත භාර දෙන්න. ' +
    'AO එය කොළේ ලියයි; ඊළඟ පියවරේදී ඔබ එය මෙහි සටහන් කරයි, ඉන්පසු ලිපිය ' +
    'නිලධාරියෙකු පත් කිරීමට නැවත ඔබ වෙත පැමිණේ.',
  'forward.submit': 'AO වෙත යවන්න',
  'forward.sending': 'යවමින්',
  'forward.sent': 'පරිපාලන නිලධාරී වෙත යවන ලදී.',
  'forward.failed': 'එම ලිපිය AO වෙත යැවිය නොහැකි විය.',
  'forward.retry': 'මෙම ලිපිය නැවත පූරණය කරන්න',

  'rail.title': 'ක්‍රියාවලි ප්‍රගතිය',
  'rail.minutesTitle':
    'විනිසුරුගේ සටහන — මෙය ලිපිය ඉදිරිපදුනේ අනුමැතිකමයි',
  'rail.unrecognised': 'හඳුනාගත නොහැකි තත්ත්වය: {status}',
  'rail.available': 'ඔබට ලබාගත හැක: {labels}',
  'rail.noneAvailable': 'මෙම තත්ත්වයේ ඔබට ක්‍රියාවලියක් නොමැත.',

  'print.button': 'විනිසිට පත්‍රය මුද්‍රා කරන්න',
  'print.ministry': 'ක්‍රීඩා අමාත්‍යාංශය, උව පළාත',
  'print.slipTitle': 'විනිසිට පත්‍රය',
  'print.dayStamp': 'දින මුදුන',
  'print.reference': 'යොමු',
  'print.status': 'තත්ත්වය',
  'print.letter': 'ලිපිය',
  'print.receivedOn': 'ලැබුණු දිනය',
  'print.senderType': 'එවන්නාගේ වර්ගය',
  'print.sender': 'එවන්නා',
  'print.subject': 'මාතෘකාව',
  'print.category': 'කාණ්ඩය',
  'print.priority': 'ප්‍රමුඛත්වය',
  'print.loggedBy': 'ලියා ඇති කරු',
  'print.registry': 'ලැයිස්තුව',
  'print.actionOfficer': 'නිර්ථමා කරු',
  'print.notYetAssigned': 'තවම පත් කර නොමැත',
  'print.completedOn': 'සම්පූර්ණ කළ දිනය',
  'print.endorsement': 'අනුමැතිකම',
  'print.instruction': 'උපදෙස',
  'print.recordedOn': 'ලියා ඇති දිනය',
  'print.noEndorsement': 'මෙම ලිපියට අදාල අනුමැතිකමක් තවම සටහන් කර නොමැත.',
  'print.signatureEndorsing': 'අනුමැතුම් කරන නිලධාරී',
  'print.signatureEndorsingHint': 'ලිපිපති හෝ පරිපාලන නිළධාරී',
  'print.signatureClerk': 'විෂය ලේඛක',
  'print.signatureClerkHint': 'මාරු කිරීම',
  'print.signatureOfficer': 'නිර්ථමා කරු',
  'print.signatureOfficerHint': 'ප්‍රයෝජනයට පත් කිරීම',
  'print.fileCopy': 'ගොනු පිටපත',
  'print.workingCopy': 'ක්‍රියාත්මක පිටපත — වසා ගොනු කර නැත (තත්ත්වය: {status})',
  'print.printed': 'මුද්‍රා කළ දිනය {date}',

  'officerPanel.progress': 'ප්‍රගතිය',
  'officerPanel.startHelp':
    'ආරම්භ කිරීම මෙම ලිපිය ක්‍රියාත්මක තත්ත්වයට මාරු කර ඔබගේ නම සමඟ ආරම්භය සටහන් කරයි.',
  'officerPanel.completeHelp': 'සම්පූර්ණ කිරීම ගොනුව වසයි. සම්පූර්ණ කිරීමේ දිනය ස්වයංක්‍රීයව ලියනු ලැබේ.',
  'officerPanel.progressLabel': 'ප්‍රගති සටහන',
  'officerPanel.notePlaceholder':
    'ඔක්තෝබර් 3 හි පරීක්ෂණය; මිල ගණන් ඉදිරිපදීම් කරමින් පවතී.',
  'officerPanel.saveNote': 'සටහන සුරකින්න',
  'officerPanel.yourActions': 'ඔබගේ ක්‍රියාවලිය',
  'officerPanel.closed':
    'මෙම ලිපිය වසා ඇත. ඇමුණුම් තවදුරටත් එකතු කළ නොහැක.',
  'officerPanel.otherRole':
    'ඊළඟ පියවර ක්‍රියාවලියේ වෙනත් භෝජයකට යැවීමකි.',
  'officerPanel.refresh': 'මෙම ලිපිය නැවත පූරණය කරන්න',
  'officerPanel.actionFailed': 'එම ක්‍රියාව සිදු කිරීමට නොහැකි විය.',
  'officerPanel.certificateHint':
    'නිදහස් කිරීමේ සහතිය, සම්පූර්ණ කිරීමේ සහතිය, හෝ ගොනුව වසන ඕනෑම ලේඛනයක්.',

  'completion.submitTitle': 'සම්පූර්ණ කිරීමේ ලේඛනය යොමු කරන්න',
  'completion.submitHelp':
    'මෙම ලිපිය සම්පූර්ණ කරන ලේඛනය අමුණා පරිපාලන නිලධාරී, ලේකම්, හෝ දෙපාර්තමේන්තු ප්‍රධානි වෙත යවන්න. ' +
    'ඔවුන් අනුමත කළ පසුව පමණක් ලිපිය සම්පූර්ණ ලෙස සලකුණු වේ.',
  'completion.approverLabel': 'යවන්නේ',
  'completion.chooseApprover': 'අනුමත කරන්නෙකු තෝරන්න',
  'completion.approverAO': 'පරිපාලන නිලධාරී',
  'completion.approverSecretary': 'ලේකම්',
  'completion.approverDepartmentHead': 'දෙපාර්තමේන්තු ප්‍රධානි',
  'completion.noteLabel': 'සටහන (විකල්ප)',
  'completion.notePlaceholder': 'මෙම ලේඛනයෙන් පෙන්නුම් කරන්නේ කුමක්ද?',
  'completion.documentLabel': 'සම්පූර්ණ කිරීමේ ලේඛනය',
  'completion.chooseFile': 'සම්පූර්ණ කිරීමේ ලේඛනයක් තෝරන්න',
  'completion.removeFile': 'ලේඛනය ඉවත් කරන්න',
  'completion.submit': 'අනුමැතිය සඳහා යොමු කරන්න',
  'completion.submitting': 'යොමු කරමින්…',
  'completion.submitFailed': 'සම්පූර්ණ කිරීමේ ලේඛනය යොමු කළ නොහැකි විය.',
  'completion.approverRequired': 'මෙම ලේඛනය අනුමත කළ යුත්තේ කවුරුන්ද යන්න තෝරන්න.',
  'completion.fileRequired': 'අමුණා ගැනීමට ලේඛනයක් තෝරන්න.',
  'completion.submittedToast': 'සම්පූර්ණ කිරීමේ ලේඛනය අනුමැතිය සඳහා යොමු කරන ලදී.',
  'completion.decideTitle': 'ඔබගේ තීරණය අපේක්ෂාවෙන් සම්පූර්ණ කිරීමේ ලේඛනය',
  'completion.submittedBy': 'ඉදිරිපදීම් කළේ',
  'completion.submittedAt': 'ඉදිරිපදීම් කළ දිනය',
  'completion.decidedBy': 'තීරණය කළේ',
  'completion.decisionLabel': 'තීරණ සටහන',
  'completion.decisionPlaceholder': 'ඔබගේ තීරණය සමඟ සටහන් වන හේතුවක්.',
  'completion.approve': 'අනුමත කර සම්පූර්ණ කරන්න',
  'completion.reject': 'ප්‍රතික්ෂේප කරන්න',
  'completion.decideFailed': 'තීරණය සුරැකිය නොහැකි විය.',
  'completion.approvedToast': 'අනුමත කරන ලදී. ලිපිය දැන් සම්පූර්ණයි.',
  'completion.rejectedToast': 'ප්‍රතික්ෂේප කරන ලදී. ලිපිය නිලධාරී වෙත නැවත යවන ලදී.',
  'completion.historyTitle': 'සම්පූර්ණ කිරීමේ ලේඛන',
  'completion.role': 'අනුමත කරන්නා',
  'completion.open': 'විවෘත කරන්න',
  'completion.loading': 'පූරණය වෙමින්…',
  'completion.downloadFailed': 'ලේඛනය බාගත කළ නොහැකි විය.',
  'completion.status.Pending': 'අපේක්ෂිතයි',
  'completion.status.Approved': 'අනුමතයි',
  'completion.status.Rejected': 'ප්‍රතික්ෂේපයි',

  'registry.exportCsv': 'CSV අපනයනය',
  'registry.exportPdf': 'මුද්‍රණය / PDF ලෙස සුරකින්න',
  'registry.exporting': 'සූදානම් වෙමින්…',
  'registry.exportFailed': 'අපනයනය සූදානම් කළ නොහැකි විය.',
  'registry.exportEmpty': 'මෙම පෙරහන් සඳහා අපනයනය කිරීමට කිසිවක් නැත.',
  'registry.exportReady': 'ලිපි {count} ක් අපනයනය කරන ලදී.',
  'registry.printTitle': 'ලිපි ලේඛනය',
  'registry.printCount': 'ලැයිස්තුගත ලිපි',
  'registry.printGenerated': 'ජනනය කළේ {date}',
  'registry.printFilters': 'යොදාගත් පෙරහන්: {summary}',
  'registry.printNoFilters': 'පෙරහන් යොදා නැත — සියලු ලිපි.',
  'registry.receivedFrom': 'ලැබුණි, සිට',
  'registry.receivedTo': 'ලැබුණි, දක්වා',

  'notification.title': 'දැනුම්දීම්',
  'notification.empty': 'දැනුම්දීම් නොමැත.',
  'notification.markAllRead': 'සියල්ල කියවා ඇති ලෙස සලකුණු කරන්න',
  'notification.open': 'දැනුම්දීම් බලන්න',
  'notification.unread': 'නොකියවූ {count}',
  'notification.openLetter': 'ලිපිය විවෘත කරන්න',

  'notification.assigned.title': 'ලිපියක් ඔබට පවරා ඇත',
  'notification.assigned.body': '{ref} — {subject}',
  'notification.forwarded_to_ao.title': 'ඔබේ පෝලිමේ නව ලිපියක් ඇත',
  'notification.forwarded_to_ao.body': '{ref} — {subject}',
  'notification.returned.title': 'ලිපියක් නැවත ඔබේ මේසයට ලැබී ඇත',
  'notification.returned.body': '{ref} — {subject}',
  'notification.approval_requested.title': 'සම්පූර්ණ කිරීමේ ලේඛනයක් ඔබේ අනුමැතිය අපේක්ෂා කරයි',
  'notification.approval_requested.body': '{ref} — {document}',
  'notification.approved.title': 'ඔබේ සම්පූර්ණ කිරීමේ ලේඛනය අනුමත විය',
  'notification.approved.body': '{ref} — {subject}',
  'notification.rejected.title': 'ඔබේ සම්පූර්ණ කිරීමේ ලේඛනය ප්‍රතික්ෂේප විය',
  'notification.rejected.body': '{ref} — {subject}',
  'notification.completed.title': 'ඔබ ලියාපදිංචි කළ ලිපියක් සම්පූර්ණ විය',
  'notification.completed.body': '{ref} — {subject}',

  'matcher.title': 'යෝග්‍ය නිලධාරී',
  'matcher.scored': 'අංශ {count} කාර්ය පේළි මැනුම් කරන ලදී',
  'matcher.loading': 'කාර්ය සටහන් මැනුම් කරමින්',
  'matcher.noSuggestion': 'තවම යෝග්‍යතාවයක් නැත.',
  'matcher.noSuggestionHint':
    'කාර්ය ගැලපුම් මැචර් පිළිතුරු බැඳීමට ලිපියක් විවෘත කරන්න.',
  'matcher.noMatch': 'මෙම ලිපියට ගැලපෙන කාර්ය සටහනක් නැත.',
  'matcher.noMatchHint':
    'මැචර් ලිපියක් කාර්ය මුල් පද මත පමණක් මැනුම් කරයි. ' +
    'මුල් පද නොමැති සටහනක් තවමත් තැන් ලබා නොහැක, ' +
    'එම නිසා මාතෘකාවට ගැලපෙන මුල් පද නැති ලිපියක් මැනුම් කළ නොහැක.',
  'matcher.matched': 'ගැලපුණු: ',
  'matcher.descriptionMatches': 'කාර්ය විස්තරයේ තවත්: ',
  'matcher.notAssigned':
    'ඉහත තෝරාගත් කෙනෙකුට ලිපිය පත් කර නොමැත. ' +
    'මෙම ලිපිය පත් කිරීමට <strong>මෙම ලිපිය පත් කරන්න</strong> ඔබන්න, ' +
    'එම තොරාගත් කෙනෙකුට පත් කිරීම සිදුවනතුරු ලිපිය එහි පිහිටියේම රඳවා ගන්න.',
  'matcher.cannotAssign':
    'ඔබගේ භෝජයට නිලධාරීව පත් කිරීමට අවසර නැත. ' +
    'මෙම ලැයිස්තුව ලිපිය ඇයි එම ස්ථානයට යොදා ඇතිද බැඳීමට ලැබෙනු ලැබුවේ එබැවිනය.',

  'attachment.title': 'ඇමුණුම් ({count})',
  'attachment.none': 'මෙම ලිපියට ස්කෑනයක් ඇතුළත් කර නොමැත.',
  'attachment.preview': 'පෙරදැක්වීම',
  'attachment.open': 'විවෘත කරන්න',
  'attachment.add': 'ගොනු එකතු කරන්න',
  'attachment.helper':
    'එකවර ගොනු 10 දක්වා. අනුමත: pdf, jpg, jpeg, png, tiff, doc, docx.',
  'attachment.uploading': 'උඩුගත කරමින්',
  'attachment.progress': '{progress}%',
  'attachment.previewHeading': 'පෙරදැක්වීම',
  'attachment.close': 'වසන්න',
  'attachment.loading': 'ගොනුව පූරණය වෙමින්',
  'attachment.downloadFailed': 'ගොනුව බාගන්නට නොහැකි විය.',
  'attachment.uploadFailed': 'ගොනුව ඇමුණුම් කර නොහැකි විය.',
  'attachment.invalidExtension':
    '"{name}" ගොනුව ඇමුණුම් කළ නොහැක. අනුමත: pdf, jpg, jpeg, png, tiff, doc, docx.',
  'attachment.tooLarge':
    '"{name}" {size} MB. සීමාව {limit} MB.',

  'new.formTitle': 'ලිපියක් ඇතුළත් කරන්න',
  'new.backToRegistry': 'ලැයිස්තුවට ආපසු',
  'new.filed': 'ලිපිය ඇතුළත් කරන ලදී.',
  'new.dayStampIssued': 'සේවාදායකය මෙම ලිපියට දින මුදුන {stamp} නිකුත් කළේය.',
  'new.openLetter': 'ලිපිය විවෘත කරන්න',
  'new.fileAnother': 'තවත් ලිපියක් ලොග් කරන්න',
  'new.failed': 'එම ලිපිය ඇතුළත් කළ නොහැකි විය.',
  'new.incoming': 'එන ලිපිය',
  'new.receivedOn': 'ලැබුණු දිනය',
  'new.senderReference': 'එවන්නාගේ යොමු',
  'new.referencePlaceholder': 'EDU/2026/TND/0142',
  'new.department': 'ප්‍රදේශ අධිකරණ',
  'new.departmentLabel': 'මෙම ලිපිය යොදනු ලබන ප්‍රදේශ අධිකරණය',
  'new.departmentLoading': 'ප්‍රදේශ අධිකරණ පූරණය වෙමින්',
  'new.departmentError': 'ප්‍රදේශ අධිකරණ බාගන්නට නොහැකි විය — පිටුව නැවත පූරණය කරන්න',
  'new.departmentPlaceholder': 'ප්‍රදේශ අධිකරණය තෝරන්න',
  'new.departmentHint':
    'අවශ්‍ය. මෙම ප්‍රදේශ අධිකරණයේ විෂය ලේඛක මෙම ලිපිය දර්ශනය කරයි; ' +
    'වෙනත් ප්‍රදේශ අධිකරණ මෙය නොදර්ශනය කරයි.',
  'new.senderType': 'එවන්නාගේ වර්ගය',
  'new.sender': 'එවන්නා',
  'new.senderPlaceholder': 'අධ්‍යාපන ප්‍රදේශ අධිකරණ',
  'new.senderSelect': 'එවන්නා තෝරන්න',
  'new.senderEmpty': 'තවම එවන්නන් නැත — + අභිනයෙන් එක් කරන්න',
  'new.senderError': 'එවන්නන් පූරණය කළ නොහැකි විය — + භාවිතයෙන් එක් කරන්න',
  'new.senderHint':
    'ලිපිය එවූ කාර්යාලය තෝරන්න, නැතහොත් + භාවිතයෙන් නව එකක් එක් කරන්න.',
  'new.addSender': 'නව එවන්නෙකු එක් කරන්න',
  'new.addSenderTitle': 'එවන්නෙකු එක් කරන්න',
  'new.senderName': 'එවන්නාගේ නම',
  'new.senderNamePlaceholder': 'අධ්‍යාපන ප්‍රදේශ අධිකරණ',
  'new.senderTypeHint':
    'කාර්යාලය සමඟ සුරැකේ, එබැවින් පසුව තේරීමේදී ක්ෂේත්‍ර දෙකම පිරේ.',
  'new.senderSave': 'එවන්නා එක් කරන්න',
  'new.senderFailed': 'එම එවන්නා එක් කළ නොහැකි විය.',
  'new.subject': 'මාතෘකාව',
  'new.subjectPlaceholder':
    'පළාත් පාසල් සඳහා පර්යාජ උපකරණ නිකුත් කිරීමේ ටෙන්ඩරය',
  'new.languageHint':
    'සිංහල හා දෙමළ මාතෘකා කාර්ය සටහන සමඟ ගැලපීමට යොදනු ලැබේ.',
  'new.priority': 'ප්‍රමුඛත්වය',
  'new.category': 'කාණ්ඩය',
  'new.categoryPlaceholder': 'සාමාන්‍ය පරිපාලනය',
  'new.categoryError': 'කාණ්ඩ ලැයිස්තුව පූරණය කළ නොහැකි විය.',
  'new.attachment': 'ස්කෑනය හෝ ඇමුණුම',
  'new.dropHere': 'ස්කෑනය මෙහි දමන්න, හෝ ගොනුවක් තෝරන්න',
  'new.dropHelper':
    'විකල්ප. .pdf, .jpg, .jpeg, .png, .tiff, .doc, .docx — 10 MB දක්වා. ' +
    'දින මුදුන සේවාදායකය විසින් ලිපිය ලියාපදිංචි කරන විට නිකුත් කරනු ලැබේ.',
  'new.selectedFile': 'තෝරාගත්: {name}',
  'new.fieldError': 'ක්ෂේත්‍රය: {field}',
  'new.uploading': 'ස්කෑනය උඩුගත කරමින්',
  'new.uploadProgress': '{progress}%',
  'new.submitting': 'ලියාපදිංචි කරමින්',
  'new.submit': 'මෙම ලිපිය ලියාපදිංචි කරන්න',

  'minutes.formTitle': 'විනිසුරුගේ සටහන් එකතු කර ඉදිරිපදීම් කරන්න',
  'minutes.formHint':
    'විනිසුරුගේ සටහන් ලියා තැබීම මෙම ලිපිය විෂය ලේඛකට යොදයි. ' +
    'එය ක්‍රියාවලියක් අතරින් ක්‍රියාවලි දෙකක් නොවේ: අනුමැතිකමක් නොමැතිව ලිපිය යොමු කර නොහැක.',
  'minutes.department': 'ප්‍රදේශ අධිකරණ',
  'minutes.departmentLabel': 'මෙම ලිපිය යොදනු ලබන ප්‍රදේශ අධිකරණය',
  'minutes.departmentLoading': 'ප්‍රදේශ අධිකරණ පූරණය වෙමින්',
  'minutes.departmentError': 'ප්‍රදේශ අධිකරණ බාගන්නට නොහැකි විය — පිටුව නැවත පූරණය කරන්න',
  'minutes.departmentPlaceholder': 'ප්‍රදේශ අධිකරණය තෝරන්න',
  'minutes.keepDepartment': 'වත්මන් ප්‍රදේශ අධිකරණය රඳවා ගන්න',
  'minutes.currentDepartmentHint':
    'මෙය ලිපිය ලැබුණු ප්‍රදේශ අධිකරණයයි. ' +
    'ඒක නොවේ නම් පමණක් වෙනස් කරන්න — එවිට ලිපිය ඔබ තෝරාගත් ප්‍රදේශ අධිකරණයට අයත් වේ.',
  'minutes.noDepartmentHint':
    'මෙම ලිපියට ප්‍රදේශ අධිකරණයක් නැත. එකක් තෝරන්න, නැතහොත් විෂය ලේඛකයෙකුට මෙය සොයා ගත නොහැක.',
  'minutes.instruction': 'උපදෙස',
  'minutes.endorsement': 'අනුමැතිකම',
  'minutes.endorsementPlaceholder':
    'යෝජනාව සලකා බලා ඇත. මාතෘකාව අදාල විෂය පළාත් නිලධාරීගේ අත යටතේ ය; යොමු කිරීමට විෂය ලේඛකයාට ඉදිරිපදීම් කරන ලදී.',
  'minutes.charCount': 'අක්ෂර {count}',
  'minutes.charCountLong': 'අක්ෂර {count} — මෙය අනුමැතිකමක් ගොඩක් දිගුයි',
  'minutes.recording': 'සටහන් කරමින්',
  'minutes.submit': 'විනිසුරුගේ සටහන් එකතු කර යොමු කරන්න',
  'minutes.presetImmediate': 'හදිසි වාර්තාවට',
  'minutes.presetDraft': 'පටිපති සකස් කරන්න',
  'minutes.presetInformation': 'විස්තර සඳහා',
  'minutes.presetAction': 'අවශ්‍ය ක්‍රියාවලියට',

  // ප්‍රධාන විෂය ලේඛකයා අධිකරණ නිලධාරීගේ නමින් විනිසුරුගේ සටහන් ලියා දීම.
  'minutes.formTitleOnBehalf': 'අධිකරණ නිලධාරීගේ විනිසුරුගේ සටහන් එකතු කර යොමු කරන්න',
  'minutes.formHintOnBehalf':
    'මෙම ලිපිය සඳහා අධිකරණ නිලධාරී තවම විනිසුරුගේ සටහන් ලියා නොමැත. ' +
    'ඔහු භාෂික ලිපිය මත ලියපු අනුමැතිකම මෙහි ඇතුළත් කරන්න — සටහන ඔහුගේ නමින් ලියා ඇති ලෙස සැලකිල්ලට ගන්නා ලදුණද, එය ලියාපදිංචි කළ ලේඛකයා ලෙස ඔබගේ නම ඇතුළත් වේ.',
  'minutes.onBehalfAuthor': 'විනිසුරුගේ සටහන් ලියන අධිකරණ නිලධාරී',
  'minutes.onBehalfHint':
    'සටහන තෝරාගත් අයගේ නමින් ලියා ඇති ලෙස සැලකිල්ලට ගන්නා ලදේ. එය ලියාපදිංචි කළ ලේඛකයා ලෙස ඔබගේ නම ඇතුළත් වේ.',
  'minutes.onBehalfNoAuthors': 'නම් කළ හැකි ක්‍රියාත්මක අධිකරණ නිලධාරී හෝ ලේඛකවරයෙකු නොමැත',
  'minutes.quickNote': 'ඉක්මන් සටහන (අමතර අංශයක් නොමැත)',
  'minutes.quickNotePlaceholder': 'උදා: මුල් ලිපිය මත අධිකරණ නිලධාරීගේ අතින් ලියා ඇති සටහනෙන්',
  'minutes.quickNoteHint': 'ගොනු පිටු සඳහා — සටහන් සමඟ පෙන්වේ.',
  'minutes.recordedBy': 'ලේඛකයා අයිතිකරු වෙනු ලෙස ලේඛකයා විසින් ලියාපදිංචි කරන ලදී',
  'minutes.quickNoteLabel': 'ඉක්මන් සටහන: {note}',

  'users.title': 'පරිශීලකයින්',
  'users.search': 'සොයන්න',
  'users.searchPlaceholder': 'නම හෝ ජාතික හඳුනා අංකය',
  'users.allRoles': 'සියලු භෝජ',
  'users.all': 'සියල්ල',
  'users.active': 'ක්‍රියාත්මක',
  'users.deactivated': 'අක්‍රිය',
  'users.add': 'පරිශීලක කෙනෙකු එකතු කරන්න',
  'users.addTitle': 'පරිශීලක කෙනෙකු එකතු කරන්න',
  'users.fullName': 'සම්පූර්ණ නම',
  'users.nic': 'ජාතික හඳුනා අංකය',
  'users.nicHint': 'අවශ්‍ය වන අතර, නාමිකා තනතුර අතර අද්වගත විය යුතුය.',
  'users.designation': 'තනතුර',
  'users.selectDesignation': 'තනතුරක් තෝරන්න',
  'users.noDepartment': 'ප්‍රදේශ අධිකරණයක් නොමැත',
  'users.password': 'මුරපදය',
  'users.passwordHint':
    'bcrypt හැෂ් ලෙස ගබඩා කරන අතර, කිසිදු API ප්‍රතිථලනයකින් නොපෙන්වනු ලැබේ.',
  'users.noMatches': 'මෙම පෙරහස් වලට ගැලපෙන පරිශීලකයෙකු නොමැත.',
  'users.none': 'තවම පරිශීලකයෙකු නොමැත.',
  'users.deactivate': 'මෙම පරිශීලකයා අක්‍රිය කරන්න',
  'users.reactivate': 'නැවත ක්‍රියාත්මක කරන්න',
  'users.updated': 'පරිශීලකයා යාවත්කාල කරන ලදී.',
  'users.created': 'පරිශීලකයා සෑදුවේ.',
  'users.centralClerk': 'මධ්‍යම පිළිගැනීමේ ලිපිකරු',
  'users.centralClerkHint':
    'සෑම දෙපාර්තමේන්තුවක් සඳහාම ලිපි පිළිගැනීම සිදු කරයි: ඕනෑම දෙපාර්තමේන්තුවක ලිපියක් බැලීමට, යැවීමට සහ AO හි මිනිත්තු සටහන් කිරීමට හැකිය. රහස්‍ය ලිපි සැඟවී පවතී.',
  'users.deactivatedNotice': '{name} අක්‍රිය කරන ලදී.',
  'users.reactivatedNotice': '{name} නැවත ක්‍රියාත්මක කරන ලදී.',
  'users.failed': 'එම පරිශීලකයා සුරක්ෂිත කළ නොහැකි විය.',
  'users.addLogin': 'පිවිසුමක් සාදන්න',
  'users.addLoginTitle': 'පිවිසුමක් සාදන්න',
  'users.addLoginIntro':
    'මෙය පිවිසුම් ගිණුම පමණක් සාදයි. පුද්ගලයාගේ විස්තර ඊළඟට, "තොරතුරු පැතිකඩක් නොමැති ගිණුම්" ලැයිස්තුවෙන් එකතු කරනු ලැබේ.',
  'users.accountEmailHint':
    'පිවිසුම් ගිණුමෙන් ලබාගන්නා අතර, පැතිකඩ සෑදූ පසු වෙනස් කළ නොහැක.',
  'users.pendingTitle': 'තොරතුරු පැතිකඩක් නොමැති ගිණුම් ({count})',
  'users.pendingHint':
    'මෙම පිවිසුම් පවතින නමුත් තවම පුද්ගලයෙකු නොවේ. නම, ජාතික හඳුනා අංකය, භූමිකාව සහ දෙපාර්තමේන්තුව එකතු කිරීමට එකක් තෝරන්න.',
  'users.pendingFailed': 'තොරතුරු පැතිකඩක් නොමැති ගිණුම් පූරණය කළ නොහැකි විය.',
  'users.completeProfile': 'පැතිකඩ සම්පූර්ණ කරන්න',
  'users.profileTitle': '{email} සඳහා පැතිකඩ සම්පූර්ණ කරන්න',
  'users.createdAt': 'සාදන ලදී',
  'users.loginCreated':
    '{email} සඳහා පිවිසුම සාදන ලදී. පහත පැතිකඩ සම්පූර්ණ කරන්න.',
  'users.profileCreated': '{name} සඳහා පැතිකඩ සාදන ලදී.',

  'departments.title': 'ප්‍රදේශ අධිකරණ',
  'departments.add': 'ප්‍රදේශ අධිකරණයක් එකතු කරන්න',
  'departments.none': 'තවම ප්‍රදේශ අධිකරණ නොමැත.',
  'departments.name': 'නම',
  'departments.code': 'කේතය',
  'departments.failed': 'එම ප්‍රදේශ අධිකරණය සුරක්ෂිත කළ නොහැකි විය.',

  'duties.add': 'කාර්යයක් එකතු කරන්න',
  'duties.addToSection': 'මෙම අංශයට එකතු කරන්න',
  'duties.section': 'අංශය',
  'duties.sectionHint':
    'එක් නිලධාරියකට එක් අංශයකට එක් කාර්යයක් පමණයි. නැවත ඇතුළත් කිරීම අනුපිටපත ලෙස ප්‍රතික්ෂේප කරනු ලැබේ.',
  'duties.sectionPlaceholder': 'අධ්‍යාපනය — පළාත් පාසල්',
  'duties.description': 'කාර්ය විස්තරය',
  'duties.descriptionPlaceholder':
    'පාසල් පරිපාලනය, ගුරුවරුන්ගේ කරුණාංග යා පරීක්ෂණ',
  'duties.keywords': 'මුල් පද',
  'duties.noOfficers': 'චතිත්‍රය සකස් කිරීමට නිලධාරීන් නොමැත.',
  'duties.noDuties': 'කාර්ය සටහන් කර නොමැත.',
  'duties.deleteTitle': 'මෙම කාර්යය මකන්න',
  'duties.deleteConfirm': 'ස්ථිරවම මකන්න',
  'duties.failed': 'එම කාර්යය සුරක්ෂිත කළ නොහැකි විය.',
  'duties.updated': 'කාර්යය යාවත්කාල කරන ලදී.',
  'duties.added': 'කාර්යය එකතු කරන ලදී.',
  'duties.removed': 'කාර්යය මකන්න ලදී.',
  'duties.loadingOfficers': 'නිලධාරීන් පූරණය වෙමින්',
  'duties.loadingChart': 'කාර්ය සටහන පූරණය වෙමින්',
  'duties.readOnly':
    'ඔබට කාර්ය සටහන් කියවා බැලීමට ලැබෙනු ලැබුවේ නම් ඒවා සංස්කරණය කළ නොහැක. සංස්කරණයට UPDATE_DUTY_CHART අවසරය අවශ්‍ය වේ.',
  'duties.auditNote':
    'කාර්ය සටහන සඳහා සෑම වෙනසක්ම විශ්ලේෂණ ලැයිස්තුවේ ලියා ඇත, ' +
    'මන්ද හේතුව මෙම මුල් පද කාර්ය ගැලපුම් මැචර් විසින් මැනුම් කරන දී ඒවාය.',
  'duties.noDutiesHint': 'අංශයක් හා එහි මුල් පද එකතු කරන්න. මුල් පද නොමැති කාර්යයක් තවමත් තැන් ලබා නොහැක.',
  'duties.keywordHint':
    'Enter or comma to add. Sinhala, Tamil and English are all matched — see the ' +
    'Officers & Duties screen for how each is scored.',
  'duties.scoredToo':
    'Scored too, but weakly: a long generic description must not outrank a direct keyword match.',
  'duties.keywordRemove': 'Remove {keyword}',

  'audit.title': 'විශ්ලේෂණ ලැයිස්තුව',
  'audit.loading': 'ඇතුළතුව කියවමින්',
  'audit.when': 'කවදා',
  'audit.action': 'ක්‍රියාව',
  'audit.by': 'කරු',
  'audit.fromAddress': 'ලිපිනය',
  'audit.entity': 'වස්තුව',
  'audit.entityType': 'නිරූපණ කාණ්ඩය',
  'audit.entityId': 'නිරූපණ අංකය',
  'audit.idPlaceholder': 'ලිපි හෝ කාර්ය අංකය',
  'audit.allActions': 'සියලු ක්‍රියා',
  'audit.noMatches': 'මෙම පෙරහස් වලට ගැලපෙන විශ්ලේෂණ ඇතුළතු නොමැත.',
  'audit.noMatchesHint':
    'ලොගය append-only වේ හා යapplication මගින් ස්ථිර නොවේ, ' +
    'එම නිසා හිස් ප්‍රතිඵලයක් ලැබුවේ පෙරහස් ඉතා පුච්චු නිසාය — දින පරාසය විස්තර කරන්න.',
  'audit.entryTitle': 'විශ්ලේෂණ ඇතුළතුව',
  'audit.whatChanged': 'වෙනස් වූ දේ',
  'audit.noFieldChange': 'මෙම ඇතුළතුවෙන් ක්ෂේත්‍ර මට්ටම වෙනසක් සටහන් කර නොමැත.',
  'audit.credentialNote':
    'මුරපද සහ ටෝකන් ඉවත් කරන ලද්දේ විශ්ලේෂණ රෝ ලියා යාමට පෙර, ' +
    'එම නිසා අර්ථවත් දෙකෙන් කිසිදු සaturation අගය නොමැත.',
  'audit.failed': 'එම විශ්ලේෂණ ලැයිස්තුව පෙන්වීමට නොහැකි විය.',
  'common.priority': 'ප්‍රමුඛතාව',
  'common.category': 'කාණ්ඩය',
  'common.date': 'දිනය',
  'departments.updated': 'දෙපාර්තමේන්තුව යාවත්කාලීන කරන ලදී.',
  'departments.added': 'දෙපාර්තමේන්තුව එක් කරන ලදී.',
  'common.saving': 'සුරකිමින්...',
  'duties.keywordPlaceholder': 'මූලපදයක් එක් කර Enter හෝ comma ඔබන්න',
  'users.email': 'විද්‍යුත් තැපෑල',
});
