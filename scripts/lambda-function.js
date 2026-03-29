exports.handler = async (event) => {
    console.log("Hello, World!");
    return {
        statusCode: 200,
        body: "Hello, World!",
    };
};