-- Seed 003: officer duty charts — the data the duty matcher scores against.
--
-- D49: an officer may hold duties in MORE THAN ONE section, which is why
-- section_name lives on officer_duties and not on users. The two demo officer
-- roles below deliberately have several rows each, so the matcher has something
-- real to rank and the duty chart screen has something to display.
--
-- Re-runnable: uq_duties_officer_section (officer_user_id, section_name) is the
-- conflict target, and the ON DUPLICATE KEY UPDATE clause keeps the descriptions
-- and keywords current without touching created_at.
--
-- The officers are resolved by NIC, not by id, for the same reason 002 does it by
-- department code: this file must not care what user ids happen to be.
--
-- ===========================================================================
-- D68: BILINGUAL KEYWORDS AND DESCRIPTIONS
-- ===========================================================================
--
-- Every duty below carries Sinhala and Tamil keywords as well as English ones,
-- and a bilingual duty description. Before D68 the matcher tokenized on [a-z0-9]
-- only, so a Sinhala or Tamil subject matched nothing at all and the suggestions
-- endpoint replied no_candidates — a duty chart that could not route the
-- ministry's other working languages. `Intl.Segmenter`, in
-- backend/utils/dutyMatcher.js, is what makes these keywords reachable.
--
-- Three rules govern the non-Latin keywords, and all three are enforced or
-- depended on by the matcher:
--
--   1. They are STEMS, not inflected forms. Sinhala and Tamil suffix, so a letter
--      containing `අධ්‍යාපනයේ` ("in education") must be reached by the keyword
--      `අධ්‍යාපන` ("education"); writing out every inflected form would mean
--      asking a clerk to do morphology by hand. The matcher prefix-matches Indic
--      keywords, so stems are what belongs here — and only stems of four
--      characters or more, below which a prefix match is a syllable fragment
--      rather than a word.
--
--   2. They are ORDINARY SUBJECT MATTER, not obscure synonyms. A chart an admin
--      can read and correct is worth more than precision that leaves the ministry
--      unable to route a letter at all.
--
--   3. A FALSE POSITIVE IS THE ACCEPTED COST, and D72 is what bounds it: these
--      are RANKED SUGGESTIONS that display the keywords which matched, and a
--      Subject Clerk confirms before anything is assigned. Nothing in this file
--      can cause a wrong assignment, a wrong permission or a lost letter — the
--      consequence of an imprecise keyword is an extra row in a list a human
--      reads.
--
-- The postpositions that appear in nearly every ministry subject (ගැන, සඳහා,
-- குறித்து, பற்றிய) are deliberately NOT here: they are in the matcher's stop-word
-- list, where suppressing them is correct, because they are grammar rather than
-- subject matter.

-- ---------------------------------------------------------------------------
-- District Officer (881234565V) — the education subject-matter officer.
-- Four sections, so their chart is the ranked-list demo.
-- ---------------------------------------------------------------------------
INSERT INTO officer_duties (officer_user_id, section_name, duty_description, keywords) VALUES
  ((SELECT id FROM users WHERE nic_no = '881234565V'), 'School Administration',
   'School administration, circulars, staff matters and school records. පාසල් පරිපාලනය, වාර්තා අනුදායන, ගුරුවරුන් සහ කාර්යාලීන ගැටෑම්. பள்ளி நிர்வாகம், சுற்று, ஆசிரியர் மற்றும் ஊழியர் விவரங்கள்.',
   '["school", "schools", "circular", "principal", "staff", "administration", "academic",
     "පාසල", "පාසල්", "වාර්තා", "ගුරුවරු", "කාල්පික", "කාර්යාල", "පරිපාලන", "අධ්‍යාපන",
     "பள்ளி", "பள்ளிகள்", "சுற்று", "ஆசிரியர்", "ஊழியர்", "நிர்வாகம்", "கல்வி"]'),
  ((SELECT id FROM users WHERE nic_no = '881234565V'), 'Procurement',
   'Tender boards, supplies, stationery and equipment procurement. මිණිමය කරන ලද උපකරණ, ලබාගැනීම් සහ අයිධකරණ. மேலதிகை மற்றும் உபகரண கொள்முதி ஒப்புரைகள்.',
   '["procurement", "tender", "tenders", "supplies", "quotation", "purchasing", "stationery",
     "මිණිමය", "මිණිමම", "ලබාගැනීම", "උපකරණ", "අයිධකරණ", "රැයින්ත්‍රිම", "උපදේශ",
     "மேலதிகை", "கொள்முதி", "உபகரண"]'),
  ((SELECT id FROM users WHERE nic_no = '881234565V'), 'Budget & Finance',
   'Provincial budget estimates, allocations and expenditure reports. ප්‍රතිපෙරඳ අපේක්ෂිත, මූල්‍ය අනුගතනය සහ රජවින වාර්තා. பிரதேச நிதி ஒதுக்குவிப்பு மற்றும் வருவாய் அறிக்கைகள்.',
   '["budget", "finance", "expenditure", "allocation", "estimates", "funds", "accounts",
     "රජවින", "මූල්‍ය", "අපේක්ෂත", "අපේක්ෂිත", "ගණන්", "ප්‍රතිපෙරඳ", "අනුදායන", "මුදල්",
     "நிதி", "பணம்", "வருவாய்", "செலவு", "திறை", "கணக்கு", "ஒதுக்குவிப்பு"]'),
  ((SELECT id FROM users WHERE nic_no = '881234565V'), 'Repairs & Maintenance',
   'Building repairs, maintenance of school buildings and furniture. ගොඩනැගිලි අලුත්කරණ, නැවතබෝධන සහ උපකරණ සැකසීම. கட்டிட பழுதுபார்ப்பு மற்றும் உபகரணப் பராமரிப்பு.',
   '["repair", "repairs", "maintenance", "building", "furniture", "roof", "renovation",
     "අලුත්කරණ", "නැවතබෝධන", "ගොඩනැගිලි", "උපකරණ", "ස්ථාපන", "අලුත්",
     "பழுது", "பழுதுபார்ப்பு", "கட்டிட", "உபகரணம்", "பராமரிப்பு"]')
ON DUPLICATE KEY UPDATE
  duty_description = VALUES(duty_description),
  keywords         = VALUES(keywords);

-- ---------------------------------------------------------------------------
-- Transport Officer (881234567V) — the fleet officer.
-- Two sections. Fewer rows than the District Officer on purpose: it is what a
-- thinner chart looks like in the ranked list, and the demo should show that a
-- clerk can see the gap rather than being handed a single confident answer.
-- ---------------------------------------------------------------------------
INSERT INTO officer_duties (officer_user_id, section_name, duty_description, keywords) VALUES
  ((SELECT id FROM users WHERE nic_no = '881234567V'), 'Fleet & Vehicles',
   'Vehicle allocation, fuel, licences, insurance and fleet records. අයිධ අනුදායන, ඉන්ධන පිරිසිදු කිරීම සහ වාහන වාර්තා. வாகன ஒதுக்குவிப்பு, எரிபொருள் மற்றும் உரிமங்கள்.',
   '["vehicle", "vehicles", "fleet", "fuel", "licence", "license", "insurance", "allocation",
     "අයිධ", "ඉන්ධන", "වාහන", "අනුදායන", "අයිධය",
     "வாகன", "கனவூர்", "ஓட்டுநர்", "உரிமம்"]'),
  ((SELECT id FROM users WHERE nic_no = '881234567V'), 'Ambulance Services',
   'Ambulance deployment, emergency transport and driver rosters. ගිලනු බලදැයීම, අනතුර්තු ගමනාගමන සහ රයදුරු ලැයිස්තුව. ஆம்புலன்ஸ் அனுப்புதல் மற்றும் அவசர போக்குவரத்து.',
   '["ambulance", "emergency", "transport", "driver", "deployment", "rescue", "patient",
     "ගිලනු", "ගිලනුව", "අනතුර්තු", "රයදුරු", "රෝගී", "රෝගීන්", "ගමනාගමන",
     "ஆம்புலன்ஸ்", "அவசர", "நோயாளி", "ஓட்டுநர்", "போக்குவரத்து"]')
ON DUPLICATE KEY UPDATE
  duty_description = VALUES(duty_description),
  keywords         = VALUES(keywords);
