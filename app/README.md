# NastyVerse application 0.2.33

Chat workspace 0.2.33: rebuilds the variable lifecycle to match SillyTavern more closely. Chat/global variables support get/set/add/inc/dec/has/delete plus JSON key/index access and message macros, mutations execute once before a message is stored, prompt-time reads stay dynamic without replaying message side effects, slash commands remain local commands with no generation, and chat translation now consumes the canonical stored message instead of re-evaluating variable macros during rendering.
