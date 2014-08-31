/* 
                   _____  _____                          .___            ___.           
    ______  __ ___/ ____\/ ____\_  _  _______ _______  __| _/______  ____\_ |__   ____  
    \____ \|  |  \   __\\   __\\ \/ \/ /\__  \\_  __ \/ __ |\_  __ \/  _ \| __ \_/ __ \ 
    |  |_> >  |  /|  |   |  |   \     /  / __ \|  | \/ /_/ | |  | \(  <_> ) \_\ \  ___/ 
    |   __/|____/ |__|   |__|    \/\_/  (____  /__|  \____ | |__|   \____/|___  /\___  >
    |__|                                     \/           \/                  \/     \/ 
  
  A Puffball module for managing identities locally.

  Usage example:
  PuffWardrobe.switchCurrent(user.username)
  PuffWardrobe.getCurrentKeys()

*/


//// USER INFO ////

/*
    
    Move this into a separate PuffIdentity module that handles identity wardrobe, profiles, and machine-based preferences.
    PuffForum uses PuffIdentity for all identity-related functionality -- this way other modules can build on PuffIdentity too.
    PuffIdentity is responsible for managing persistence of identities, keeping the core clean of such messy concerns.

    -- Maybe call it PuffWardrobe? Is this just a place for local identity management, or also a place for managing user records?
    -- We need to separate out these concerns...


  ---> register callback handlers for user record creation and modification
  ---> PuffWardrobe.init registers those with PB.onUserCreation and PB.onUserModification
  ---> canonical identity object: username, keys.public.default, keys.private.admin, latest, etc. [or just use the spec... yeah. w/ .private for private key versions...]
  ---> always use CIO for everything; distinguish identities from users for all time. (...?)
  ---> 


*/

PuffWardrobe = {}
PuffWardrobe.keychain = false       // NOTE: starts false to trigger localStorage fetch. don't use this variable directly!
PuffWardrobe.currentKeys = false    // false if not set, so watch out

/**
 * Get the current keys
 * @return {string}
 */
PuffWardrobe.getCurrentKeys = function() {
    return PuffWardrobe.currentKeys
}

/**
 * get the current username
 * @return {string}
 */
PuffWardrobe.getCurrentUsername = function() {
    return (PuffWardrobe.currentKeys || {}).username || ''
}

/**
 * get the current user record
 * @return {string}
 */
PuffWardrobe.getCurrentUserRecord = function() {
    var username = PuffWardrobe.getCurrentUsername()
    if(!username) 
        return PB.onError('No current user in wardrobe')
    
    // THINK: it's weird to hit the cache directly from here, but if we don't then we always get a promise,
    //        even if we hit the cache, and this should return a proper userRecord, not a promise, 
    //        since after all we have stored the userRecord in our wardrobe, haven't we?
    
    var userRecord = PB.Data.userRecords[username]
    if(!userRecord)
        return PB.onError('That user does not exist in our records')
    
    return userRecord
}

/**
 * get all the username and keys
 * @return {Object[]}
 */
PuffWardrobe.getAll = function() {
    if(!PuffWardrobe.keychain)
        PuffWardrobe.keychain = PB.Persist.get('keychain') || {}
    
    return PuffWardrobe.keychain
}

/**
 * Change current keyset. also used for clearing the current keyset (call with '')
 * @param  {string} username
 * @return {string[]}
 */
PuffWardrobe.switchCurrent = function(username) {
    //// Change current keyset. also used for clearing the current keyset (call with '')

    if(!username)
        return PuffWardrobe.currentKeys = false
    
    var keychain = PuffWardrobe.getAll()
    var keys     = keychain[username]

    if(!keys)
        return PB.onError('There are no keys in the wardrobe for that identity -- try adding it first')

    PB.Persist.save('identity', username); // save to localStorage
    
    // TODO: this doesn't belong here, move it (probably by registering interesting users with the platform)
    PB.Data.importPrivateShells(username)
    
    return PuffWardrobe.currentKeys = keys
}

/**
 * Store the user's root key
 * @param  {string} username
 * @param  {string} rootKey
 */
PuffWardrobe.storeRootKey = function(username, rootKey) {
    PuffWardrobe.storePrivateKeys(username, rootKey)
}

/**
 * Store the user's admin key
 * @param  {string} username
 * @param  {string} rootKey
 */
PuffWardrobe.storeAdminKey = function(username, adminKey) {
    PuffWardrobe.storePrivateKeys(username, false, adminKey)
}

/**
 * Store the user's default key
 * @param  {string} username
 * @param  {string} rootKey
 */
PuffWardrobe.storeDefaultKey = function(username, defaultKey) {
    PuffWardrobe.storePrivateKeys(username, false, false, defaultKey)
}

/**
 * Add keys to the wardrobe with no validation
 * @param  {string} username
 * @param  {string} rootKey
 * @param  {string} adminKey
 * @param  {string} defaultKey
 */
PuffWardrobe.storePrivateKeys = function(username, rootKey, adminKey, defaultKey) {
    //// Add keys to the wardrobe with no validation
    PuffWardrobe.keychain = PuffWardrobe.getAll()
    
    PuffWardrobe.keychain[username] = PuffWardrobe.keychain[username] || {username: username}
    
    if(rootKey)
        PuffWardrobe.keychain[username].root    = rootKey
    if(adminKey)
        PuffWardrobe.keychain[username].admin   = adminKey
    if(defaultKey)
        PuffWardrobe.keychain[username].default = defaultKey
    
    if(PuffWardrobe.getPref('storeKeychain'))
        PB.Persist.save('keychain', PuffWardrobe.keychain)
}

/**
 * Ensure keys match the userRecord
 * @param  {string}   username
 * @param  {string}   rootKey
 * @param  {string}   adminKey
 * @param  {string}   defaultKey
 * @param  {Function} callback
 * @return {string}
 */
PuffWardrobe.validatePrivateKeys = function(username, rootKey, adminKey, defaultKey, callback) {
    //// Ensure keys match the userRecord
    
    var prom = PB.getUserRecord(username)
    
    return prom.then(function(userRecord) {
        // validate any provided private keys against the userRecord's public keys
        if(rootKey    && PB.Crypto.privateToPublic(rootKey) != userRecord.rootKey)
            PB.throwError('That private root key does not match the public root key on record')
        if(adminKey   && PB.Crypto.privateToPublic(adminKey) != userRecord.adminKey)
            PB.throwError('That private admin key does not match the public admin key on record')
        if(defaultKey && PB.Crypto.privateToPublic(defaultKey) != userRecord.defaultKey)
            PB.throwError('That private default key does not match the public default key on record')
        
        return userRecord
    }, PB.promiseError('Could not store private keys due to faulty user record'))
}


/**
 * Clear the identity's private keys from the wardrobe
 * @param  {string} username
 */
PuffWardrobe.removeKeys = function(username) {
    //// clear the identity's private keys from the wardrobe
    PuffWardrobe.keychain = PuffWardrobe.getAll()

    delete PuffWardrobe.keychain[username]
    
    if(PuffWardrobe.currentKeys.username == username)
        PuffWardrobe.currentKeys = false
    
    if(PuffWardrobe.getPref('storeKeychain'))
        PB.Persist.save('keychain', PuffWardrobe.keychain)
}

/**
 * Create a new anonymous identity and add it to the local identity list
 */
PuffWardrobe.addNewAnonUser = function() {
    //// create a new anonymous identity and add it to the local identity list
    //// it seems strange to have this in PuffWardrobe, but we have to keep the generated private keys here.

    // generate private keys
    var privateRootKey    = PB.Crypto.generatePrivateKey();
    var privateAdminKey   = PB.Crypto.generatePrivateKey();
    var privateDefaultKey = PB.Crypto.generatePrivateKey();
    
    // generate public keys
    var rootKey    = PB.Crypto.privateToPublic(privateRootKey);
    var adminKey   = PB.Crypto.privateToPublic(privateAdminKey);
    var defaultKey = PB.Crypto.privateToPublic(privateDefaultKey);

    // build new username
    var anonUsername = PuffWardrobe.generateRandomUsername();
    var newUsername  = 'anon.' + anonUsername;

    // send it off
    var prom = PB.Net.registerSubuser('anon', CONFIG.users.anon.adminKey, newUsername, rootKey, adminKey, defaultKey);

    return prom.then(function(userRecord) {
                   // store directly because we know they're valid, and so we don't get tangled up in more promises
                   PuffWardrobe.storePrivateKeys(newUsername, privateRootKey, privateAdminKey, privateDefaultKey);
                   return userRecord;
               },
               PB.promiseError('Anonymous user ' + anonUsername + ' could not be added'));
}

/**
 * Generate a random username
 * @return {string}
 */
PuffWardrobe.generateRandomUsername = function() {
    var generatedName = '';
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for(var i=0; i<10; i++) {
        generatedName = generatedName + alphabet[Math.floor(Math.random() * (alphabet.length))];
    }
    return generatedName;
}

/**
 * Get the current user's DHT record, or create a new anon user, or die trying
 * @return {string}
 */
PuffWardrobe.getUpToDateUserAtAnyCost = function() {
    //// Either get the current user's DHT record, or create a new anon user, or die trying

    var username = PuffWardrobe.getCurrentUsername()

    if(username)
        return PB.getUserRecordNoCache(username)
    
    var prom = PuffWardrobe.addNewAnonUser()
    
    return prom.then(function(userRecord) {
        PuffWardrobe.switchCurrent(userRecord.username)
        console.log("Setting current user to " + userRecord.username);
        return userRecord
    })
}




////// PREFS ///////

/*
    These are related to this individual machine, as opposed to the identities stored therein.
    Identity-related preferences are... encrypted in the profile? That seems ugly, but maybe. 
    How are these machine-based prefs shared between machines? A special prefs puff?
*/


PuffWardrobe.prefsarray = false  // put this somewhere else

/**
 * to get the preference 
 * @param  {string} key
 * @return {Prefs(String|Boolean)}
 */
PuffWardrobe.getPref = function(key) {
    var prefs = PuffWardrobe.getAllPrefs()
    return prefs[key]
}

/**
 * to get all the preferences
 * @return {Prefs(string|boolean)[]}
 */
PuffWardrobe.getAllPrefs = function() {
    if(!PuffWardrobe.prefsarray)
        PuffWardrobe.prefsarray = PB.Persist.get('prefs') || {}
    
    return PuffWardrobe.prefsarray
}

/**
 * to set the preference
 * @param {string} key
 * @param {string} value
 */
PuffWardrobe.setPref = function(key, value) {
    var prefs = PuffWardrobe.getAllPrefs()
    var newprefs = Boron.set_deep_value(prefs, key, value); // allows dot-paths

    PuffWardrobe.prefsarray = newprefs

    var filename = 'prefs'
    PB.Persist.save(filename, newprefs)
    
    return newprefs
}

/**
 * to remove the preferences
 */
PuffWardrobe.removePrefs = function() {
    var filename = 'prefs'
    PB.Persist.remove(filename)
}



////// PROFILE ///////

/*
    These exist on a per-identity basis, and are stored on the machine 
    as part of the identity's presence in the user's identity wardrobe.
*/

PuffWardrobe.profilearray = {}  // THINK: put this somewhere else

/**
 * to get the profile item
 * @param  {string} key
 * @return {object}
 */
PuffWardrobe.getProfileItem = function(key) {
    var username = PuffWardrobe.currentKeys.username
    return PuffWardrobe.getUserProfileItem(username, key)
}

/**
 * to set the profile item
 * @param {string} key
 * @param {string} value
 */
PuffWardrobe.setProfileItem = function(key, value) {
    var username = PuffWardrobe.currentKeys.username
    return PuffWardrobe.setUserProfileItems(username, key, value)
}

/** 
 * to get all profile items
 * @return {object}
 */
PuffWardrobe.getAllProfileItems = function() {
    var username = PuffWardrobe.currentKeys.username
    return PuffWardrobe.getAllUserProfileItems(username)
}

/**
 * Get a specific profile item for a user
 * @param  {string} username
 * @param  {string} key
 * @return {object}
 */
PuffWardrobe.getUserProfileItem = function(username, key) {
    var profile = PuffWardrobe.getAllUserProfileItems(username)
    return profile[key]
}

/**
 * Get all of the user's profile items
 * @param  {string} username
 * @return {object}
 */
PuffWardrobe.getAllUserProfileItems = function(username) {
    if(!username) return {} // erm derp derp
    
    var parray = PuffWardrobe.profilearray
    if(parray[username]) return parray[username]  // is this always right?
    
    var profilefile = 'profile::' + username
    parray[username] = PB.Persist.get(profilefile) || {}
    
    return parray[username]
}

/**
 * Set the user's profile items
 * @param {string} username
 * @param {string} key
 * @param {string} value
 */
PuffWardrobe.setUserProfileItems = function(username, key, value) {
    if(!username) return false
    
    var profile = PuffWardrobe.getAllUserProfileItems(username)
    var newprofile = Boron.set_deep_value(profile, key, value); // allows dot-paths

    PuffWardrobe.profilearray[username] = newprofile

    var profilefile = 'profile::' + username;
    PB.Persist.save(profilefile, newprofile)
    
    return newprofile
}

/**
 * Remove the user's profile from wardrobe
 * @param  {string} username
 * @return {(void|false)}
 */
PuffWardrobe.removeUserProfile = function(username) {
    if(!username) return false
    
    PuffWardrobe.profilearray.delete(username)
    
    var profilefile = 'profile::' + username;
    PB.Persist.remove(profilefile)
}