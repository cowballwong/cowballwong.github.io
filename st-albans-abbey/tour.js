// Guided tour: each stop sets the year and the camera. Text is drawn from research/history.json and its sources.
export const TOUR = [
  {when: 'AD 200', year: 200, title: 'Verulamium', cam: [-380, 170, 860], look: [-900, -14, 360],
    text: 'Across the River Ver stood Verulamium, one of the largest towns in Roman Britain, with a forum, a theatre and a wall circuit built by the early 3rd century. The street grid here is a schematic reconstruction; the wall segments you will see later are real survivals.'},
  {when: 'c. AD 250 to 305', year: 300, title: 'Alban on the hill', cam: [-620, 70, 430], look: [60, 6, 0],
    text: 'Alban sheltered a Christian priest, was arrested in his place, and was led out of the town, across the river and up this empty hill to be executed. The date is disputed: Bede says 305, modern historians favour the 250s. A shrine marked the spot.'},
  {when: '1115', year: 1116, title: 'Paul of Caen’s abbey', cam: [-120, 95, 230], look: [84, 14, 0],
    text: 'Abbot Paul of Caen began a great Norman church in 1077, building it from flint and from brick and tile carried up from the ruins of Verulamium. It was consecrated on 28 December 1115. Its east end then still had apses; the long nave and the tower are recognisably the ones standing today.'},
  {when: '1400', year: 1400, title: 'The abbey at its height', cam: [-90, 120, 260], look: [70, 0, 30],
    text: 'By 1400 the Benedictine abbey had a Gothic east end, the Lady Chapel, a rebuilt south side of the nave after the collapse of 1323, the shrine of St Alban and its Watching Loft, and the Great Gateway of 1365. Cloisters and monastic buildings filled the slope to the south.'},
  {when: '1539', year: 1560, title: 'Dissolution', cam: [-60, 110, 280], look: [70, 0, 40],
    text: 'Henry VIII dissolved the abbey in 1539. The monastic buildings were pulled down; in 1553 the townspeople bought the church for £400 to use as their parish church, and the Lady Chapel became a grammar school, walled off from the rest.'},
  {when: '1883', year: 1890, title: 'Grimthorpe’s west front', cam: [-45, 18, 30], look: [3, 14, 0],
    text: 'By the 19th century the building was close to collapse. Lord Grimthorpe paid for a drastic restoration and designed a new west front (1880 to 1883), much criticised at the time. In 1877 the abbey church had become a cathedral.'},
  {when: 'Inside today', year: 2026, title: 'Towards the altar', inside: true, fov: 50, cam: [18, 1.7, 0], look: [100, 6, 0],
    text: 'Stand at the west end and look east down one of the longest naves in England. Round Norman arches on the left, pointed Early English bays behind you, the rebuilt Decorated bays on the right, a painted timber ceiling above, medieval paintings on the Norman piers, and the stone nave screen whose seven martyrs returned in 2015.'},
  {when: 'Inside today', year: 2026, title: 'The Saints’ Chapel', section: true, cam: [102, 46, 62], look: [123, 4, -5],
    text: 'East of the Wallingford Screen stands the shrine of St Alban, reassembled from fragments in 1872. The oak Watching Loft faces Duke Humphrey’s tomb across the chapel; St Amphibalus’s shrine stands nearby. The cathedral says it is the only one in England with two medieval pedestal shrines.'},
  {when: 'Today', year: 2026, title: 'Seventeen centuries on one hill', cam: [-260, 240, 440], look: [60, 0, 40],
    text: 'The 1982 Chapter House and the 2019 Welcome Centre now stand on the south side. Below the hill, Verulamium Park keeps the lake, the Roman wall and the hypocaust. Drag the timeline to watch it all grow, or open Places to explore 45 spots.'},
];

// Hand-placed camera views for spots where the automatic framing is poor.
// Interior views (25 Oct): inside: true = eye-level views meant to be seen WITHOUT the section cut and WITH
// setInteriorLight(true) (interior.js); fov is a suggestion. The others work with the section cut (north half kept).
export const VIEWS = {
  'walk-in': {cam: [18, 1.7, 0], look: [100, 6, 0], fov: 50, inside: true},           // "Towards the altar"
  'nave-wall-paintings': {cam: [38.2, 3.6, 1.2], look: [42.8, 4.8, -5.6]},
  'norman-nave-arcade': {cam: [50, 9, 16], look: [62, 9.5, -5.5]},
  'early-english-west-bays': {cam: [12, 9, 16], look: [20, 9.5, -5.5]},
  'nave-screen': {cam: [57, 2.5, 1], look: [68, 4.5, 0], fov: 50, inside: true},
  'decorated-south-arcade': {cam: [42, 3, -3.2], look: [52, 8.5, 5.5], fov: 50, inside: true},
  'quire-ceiling': {cam: [74, 3, 0], look: [84, 20, 0], fov: 55, inside: true},
  'tower-crossing': {cam: [93.2, 1.8, 0], look: [96.6, 31, 0], fov: 60, inside: true},
  'wallingford-screen': {cam: [106, 3.5, 0], look: [121, 6.5, 0], fov: 50, inside: true},
  'presbytery-ceiling': {cam: [106, 3, 0], look: [116, 21, 0], fov: 55, inside: true},
  'shrine-of-st-alban': {cam: [122.6, 3.2, 3.6], look: [126, 2.6, -1.2], fov: 50, inside: true},
  'watching-loft': {cam: [124.2, 2.4, 2.6], look: [126.3, 3.4, -5.2], fov: 50, inside: true},
  'duke-humphrey-tomb': {cam: [129.2, 2.2, 1.4], look: [126.6, 3.4, 5.8], fov: 50, inside: true},
  'ramryge-chantry': {cam: [111.5, 2.6, 2.8], look: [115.5, 3.8, -6.1], fov: 50, inside: true},
  'wheathampstead-chantry': {cam: [111.5, 2.6, -2.8], look: [115.5, 3.8, 6.3], fov: 50, inside: true},
};
