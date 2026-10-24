/** @type {import('next').NextConfig} */
const config = {
  // Keep production integration tests separate from an existing developer server.
  distDir: process.env.LUNATOON_TEST_BUILD === "1" ? ".next-engine" : ".next",
};
export default config;
