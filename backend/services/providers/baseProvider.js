class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  isAvailable() {
    return true;
  }

  async generate() {
    throw new Error(`Provider ${this.name} must implement generate()`);
  }
}

module.exports = {
  BaseProvider,
};