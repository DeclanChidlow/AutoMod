import { app, PORT } from ".";

const server = app.listen(PORT, () => console.info(`Listening on port ${PORT}`));

export default server;
