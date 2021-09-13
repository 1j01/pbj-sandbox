
# <img src="icon-47x47.png" height="32"> Point Based Physics 2D <img src="icon-48x48.png" height="32">

A point-based physics sandbox, with several tools to construct shapes and scenes.

You can [check it out here](https://1j01.github.io/pbp2d).

## Features

- Undo/redo
- Selection, copy/paste/delete
- **Dynamic audio** that responds to the physics (must be enabled first)
- Collidable windows
- Rope tool
- Ball tool
- Glue tool
- Precise connector tool
- Ghost trails, slow motion, gravity, and other settings
- Keyboard shortcuts to switch tools (and to use some tools without switching)
- Touch support

## Ways to Lose Data

This should be considered a toy.
However, since this is a topic I care about, I like to think about ways users can lose data, and I've documented it here.

There's **no save/load**. And the clipboard is internal, so you can't use it as a workaround to save/load. Everything is lost if you close the tab.

Some things are not in the undo state, even though they affect the world:
- browser window size,
- in-app window positions and sizes,
- simulation options like gravity

Furthermore, if the simulation is active, undo/redo is destructive,
because the states will be replaced with ones further ahead in time,
as you go back and forth.
For example, if you throw a point, and undo, the redo state is the state at which you undid the throw, so if you redo, it will be in midair.
Then it lands, and you undo and redo, and it's already landed in the redo state.

And some things don't create undo history, like dragging windows,
so you can go for quite some time messing around without creating any undo states you can go back to.

Eventually I plan to create a system where none of these things are the case.
I'm calling that system [Mopaint](https://mopaint.app/) for now, but it's very early, and not focused on physics at all — yet. 🙂

## Help + TODO

See in-app Help and TODO windows accessible from the Options window.

## License

[WTFPL](https://en.wikipedia.org/wiki/WTFPL) or [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

## Contributing

This is just a toy, so I'm happy growing it as organically as the structures you can create with it.

Feel free to send pull requests adding weird tools.

## See Also

* [Skele2D][], a newer project of mine, a point-based editor / game engine thing

* [verlet-js][], a point based physics engine that can have more solid shapes (bodies) because it uses [Verlet integration][]

* [os-gui.js][], the windowing library I use for this project

[Skele2D]: https://github.com/1j01/skele2d
[verlet-js]: https://github.com/subprotocol/verlet-js
[Verlet integration]: https://en.wikipedia.org/wiki/Verlet_integration
[os-gui.js]: https://github.com/1j01/os-gui
