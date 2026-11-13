// The game's own short list of things it can be told to do, and what each one means: shared by the two routes that turn
// a person's words into orders (api/intent.js for a spoken order, api/guide.js for the voice that helps).
export const ACTIONS = ['fly', 'land', 'glide', 'bird', 'human', 'jump', 'dive', 'climb', 'faster', 'slower', 'left', 'right', 'around', 'walk', 'run', 'stop',
  'go_there', 'map', 'photo', 'snap', 'close', 'cinematic', 'normalcam', 'players', 'chat', 'mute', 'unmute', 'help',
  'objective', 'home', 'temple', 'nova', 'blow', 'perch', 'explain', 'closer', 'further', 'face', 'wide',
  'menu', 'hands_on', 'hands_off', 'mic_off', 'tilt', 'thumb', 'quality_up', 'quality_down', 'letters_up', 'letters_down', 'letters_fit', 'visuals', 'look_share', 'look_wear', 'look_keep', 'map_bigger', 'map_smaller', 'xr_leave', 'act', 'album', 'hover', 'map3d', 'map2d', 'map_left', 'map_right', 'map_up', 'map_down', 'map_north', 'watch', 'bolt', 'record', 'record_stop', 'mark_here', 'mark_next', 'mark_home', 'wind_share', 'wind_hide'];

export const ACTION_DOC = `fly (take off / keep flying), land (come down where he is), glide (open wings and glide), bird (become the phoenix), human (become a man again / fold wings),
jump, dive, climb, faster, slower, left, right, around (turn around), walk, run, stop (stop whatever he is doing),
go_there (go to the place the player is looking at or pointing at), map, photo (photo camera), snap (take the picture), close (close whatever is open),
cinematic (cinematic camera), normalcam (normal camera), players (show who else is playing), chat,
mute, unmute, help (list what can be said), objective (what to do next in the story), home (go back to Olympus), temple (go to the next god's temple),
nova (a burst of fire all round him that burns back the dead attacking him in the Underworld),
blow (the bird breathes out a gust: a burst of speed, and a river of wind along his path that anyone can ride),
perch (land and stay a bird), explain (how to play), closer / further (move the camera in or out), face (a close-up of him), wide (a wide shot),
menu (open or close the menu), hands_on / hands_off (steer with hands seen by the camera, or stop), mic_off (stop listening), tilt / thumb (how a phone steers),
quality_up / quality_down (sharper graphics, or smoother), letters_up / letters_down (bigger or smaller letters in the picture), letters_fit (let the letters fit the screen again), visuals (open the panel where the look of the picture is chosen: characters, colour, paper, and looks made from a description), look_share (copy a link to the look he is wearing), look_keep (keep the look he is wearing), look_wear (wear the look another flier has just offered him), act (do whatever the words in the middle of the screen offer: light the torch, kneel, speak to the one in front of him), map_bigger / map_smaller, xr_leave (step out of the headset's room), look:<name> (wear a look: classic, terminal, amber, paper, blocks, matrix, braille, olympian, neon or noir — or any few words describing one, and it is made),
album (open the photographs he has taken), hover (hold him in the air where he is and open the photo camera).
map3d / map2d (the map as a model standing in three dimensions, or laid flat), map_left / map_right (turn the map), map_up / map_down (tip the map up or lay it further over), map_north (square the map north up).
watch (be carried to Crete to watch a new player who is just beginning).
bolt (throw his thunderbolt at whatever he is looking at, once Hephaestus has made him one).
record / record_stop (start or stop recording a film of what the lens sees, up to half a minute, kept in his album), mark_here (keep the place he is, or the place he last pointed at, as a mark he can come back to), mark_next (choose the next of his kept marks: a wind in his colour is laid from him to it, which he can ride), mark_home (lay that wind to the summit of Olympus, and fly it), wind_share / wind_hide (let his friends see and ride his guiding wind, or keep it to himself).
To stay with another player, use "follow:<their name>"; to go to a named place, god or player by his own wings (he flies or walks there himself), use "goto:<name>".
To be carried there at once (teleported, "take me", "carry me", "beam me") to another player or to a named place, use "warp:<name>".
Places that have names: "summit" (the top of Olympus, the thrones, home), "crete" (the labyrinth, where it began), "volcano", "temple" (the nearest one), any god by name ("hermes", "zeus"…), "my island" (his patron god's), "cave" (the nearest hole in the earth, a way down into the Underworld by land — or, down there, the way back up), "parthenon" (Athena's great temple on its hill), "monasteries" (the nearest of the monasteries that stand on tall rocks out in the country), "objective" (wherever the story wants him next), "my mark" (the place he marked).
To keep another player marked on screen wherever they go, use "track:<their name>" (and "untrack" to stop). To add or remove a friend, use "friend:<their name>" or "unfriend:<their name>".
To change shape, use "become:<animal>" (e.g. "become:whale").
To change what he is called (what his body is written in, and what others see), use "name:<the new name>" (letters and numbers, twelve at most).`;

// only the game's own words come back, whatever the model wrote
export const cleanActions = list => (Array.isArray(list) ? list : []).slice(0, 5).map(a => String(a || '').toLowerCase().trim())
  .filter(a => ACTIONS.includes(a) || /^(become|goto|follow|warp|track|friend|unfriend|name|look):[a-z][a-z0-9 \-']{1,30}$/.test(a) || a === 'untrack');
